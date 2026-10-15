import { NextRequest, NextResponse } from "next/server";
import { readReceiptFields } from "@/lib/expenses/receipt-extract";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileFailure, mobileServerError } from "@/lib/mobile/respond";

/** Read a receipt photo so the capture form can fill itself in, as on the web. */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;

    const result = await readReceiptFields(await request.formData(), "file");
    if (!result.ok) return mobileFailure(result);
    return NextResponse.json({ success: true, data: result.extraction });
  } catch (error) {
    return mobileServerError("Receipt extract error", error);
  }
}
