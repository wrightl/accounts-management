import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { toMobileExpense } from "@/lib/mobile/expense-payload";
import { approvePendingExpense, type ApproveStatus } from "@/lib/expenses/review";
import { ensureLocalUser } from "@/lib/users";

type Params = Promise<{ id: string }>;

const APPROVE_STATUSES: readonly ApproveStatus[] = [
  "recorded",
  "reimbursable",
  "company_paid",
];

export async function POST(
  request: NextRequest,
  segmentData: { params: Params }
) {
  const params = await segmentData.params;
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const body = await request.json().catch(() => ({}));
    const approvalType = body?.approvalType || "recorded";
    if (!APPROVE_STATUSES.includes(approvalType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid approval type" },
        { status: 400 }
      );
    }

    // Same rules as the web review: positive amount, payer for reimbursable,
    // VAT, audit, bank-match refresh.
    const localUserId = await ensureLocalUser(user);
    const result = await approvePendingExpense(
      { companyId: user.companyId, localUserId },
      params.id,
      { status: approvalType },
    );
    if (!result.ok) {
      const status = result.error === "Expense not found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    const [expense] = await getDb()
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, params.id), eq(expenses.companyId, user.companyId)))
      .limit(1);

    return NextResponse.json({ success: true, data: toMobileExpense(expense) });
  } catch (error) {
    console.error("Approve expense error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
