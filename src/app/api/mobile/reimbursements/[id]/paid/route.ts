import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/labels/params";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileFailure, mobileServerError } from "@/lib/mobile/respond";
import { markReimbursementRunPaid } from "@/lib/reimbursements/mark-paid";
import { ensureLocalUser } from "@/lib/users";

type Params = Promise<{ id: string }>;

/**
 * Mark a reimbursement run paid once the money has been sent, as on the web.
 * Matching it to the bank payment is left to the web's bank screen.
 */
export async function POST(_request: NextRequest, segmentData: { params: Params }) {
  const { id } = await segmentData.params;
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;
    if (!isUuid(id)) return mobileError("Reimbursement not found", 404);

    const result = await markReimbursementRunPaid(
      { companyId: user.companyId, localUserId: await ensureLocalUser(user) },
      id,
      {},
    );
    if (!result.ok) {
      return result.error === "Reimbursement not found"
        ? mobileError(result.error, 404)
        : mobileFailure(result);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileServerError("Mark reimbursement paid error", error);
  }
}
