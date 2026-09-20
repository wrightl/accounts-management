import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireMobileAuth } from "@/lib/mobile-auth";

type Params = Promise<{ id: string }>;

export async function POST(
  request: NextRequest,
  segmentData: { params: Params }
) {
  const params = await segmentData.params;
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const body = await request.json();
    const approvalType = body.approvalType || "recorded";

    if (!["recorded", "reimbursable", "company_paid"].includes(approvalType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid approval type" },
        { status: 400 }
      );
    }

    const db = getDb();
    const [expense] = await db
      .update(expenses)
      .set({
        status: approvalType,
      })
      .where(
        and(
          eq(expenses.id, params.id),
          eq(expenses.companyId, user.companyId),
          eq(expenses.status, "pending")
        )
      )
      .returning();

    if (!expense) {
      return NextResponse.json(
        { ok: false, error: "Expense not found or already approved" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: expense.id,
        companyId: expense.companyId,
        description: expense.description,
        amountPence: expense.amountPence,
        category: expense.category,
        expenseDate: expense.spentAt,
        status: expense.status,
        notes: null,
        billable: expense.billable,
        source: expense.source,
        receipts: [],
        createdAt: expense.createdAt.toISOString(),
        updatedAt: expense.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Approve expense error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
