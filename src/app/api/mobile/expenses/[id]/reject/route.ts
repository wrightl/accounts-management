import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { toMobileExpense } from "@/lib/mobile/expense-payload";
import { rejectPendingExpense } from "@/lib/expenses/review";
import { ensureLocalUser } from "@/lib/users";

type Params = Promise<{ id: string }>;

export async function POST(
  _request: NextRequest,
  segmentData: { params: Params }
) {
  const params = await segmentData.params;
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const [expense] = await getDb()
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, params.id), eq(expenses.companyId, user.companyId)))
      .limit(1);

    if (!expense) {
      return NextResponse.json(
        { ok: false, error: "Expense not found" },
        { status: 404 }
      );
    }

    // Reject discards the pending expense, matching the web review.
    const localUserId = await ensureLocalUser(user);
    const result = await rejectPendingExpense(
      { companyId: user.companyId, localUserId },
      params.id,
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: toMobileExpense({ ...expense, status: "rejected" }),
    });
  } catch (error) {
    console.error("Reject expense error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
