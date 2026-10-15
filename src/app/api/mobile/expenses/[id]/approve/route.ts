import { NextRequest, NextResponse } from "next/server";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { loadMobileExpense } from "@/lib/mobile/expenses";
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
    // No default: the person must choose, as on the web review form.
    const approvalType = body?.approvalType;
    if (!APPROVE_STATUSES.includes(approvalType)) {
      return NextResponse.json(
        { success: false, error: "Choose how the expense was paid" },
        { status: 400 }
      );
    }
    const paidByUserId =
      typeof body?.paidByUserId === "string" && body.paidByUserId
        ? body.paidByUserId
        : null;

    // Same rules as the web review: positive amount, payer for reimbursable,
    // VAT, audit, bank-match refresh.
    const localUserId = await ensureLocalUser(user);
    const result = await approvePendingExpense(
      { companyId: user.companyId, localUserId },
      params.id,
      { status: approvalType, paidByUserId },
    );
    if (!result.ok) {
      const status = result.error === "Expense not found" ? 404 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      data: await loadMobileExpense(user.companyId, params.id),
    });
  } catch (error) {
    console.error("Approve expense error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
