import { NextRequest, NextResponse } from "next/server";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { loadMobileExpense } from "@/lib/mobile/expenses";

type Params = Promise<{ id: string }>;

export async function GET(
  _request: NextRequest,
  segmentData: { params: Params }
) {
  const params = await segmentData.params;
  try {
    const authz = await requireMobileAuth("accounts:read");
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const expense = await loadMobileExpense(user.companyId, params.id);
    if (!expense) {
      return NextResponse.json(
        { success: false, error: "Expense not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: expense });
  } catch (error) {
    console.error("Get expense error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
