import { NextRequest, NextResponse } from "next/server";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { storeExpenseReceipt } from "@/lib/expenses/review";
import { ensureLocalUser } from "@/lib/users";

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

    // Same validation as web uploads: 8 MB cap and sniffed image/PDF type.
    const localUserId = await ensureLocalUser(user);
    const result = await storeExpenseReceipt(
      { companyId: user.companyId, localUserId },
      params.id,
      await request.formData(),
      "file",
    );
    if (!result.ok) {
      const status = result.error === "Expense not found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      receiptId: result.id,
      message: "Receipt uploaded successfully",
    });
  } catch (error) {
    console.error("Upload receipt error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
