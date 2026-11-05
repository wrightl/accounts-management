import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/labels/params";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileFailure, mobileServerError } from "@/lib/mobile/respond";
import { recordInvoicePayment } from "@/lib/payments/record";
import { ensureLocalUser } from "@/lib/users";

type Params = Promise<{ id: string }>;

/**
 * Record money received against an invoice, as Record payment does on the
 * web. Matching it to a bank row is left to the web's bank screen.
 */
export async function POST(request: NextRequest, segmentData: { params: Params }) {
  const { id } = await segmentData.params;
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;
    if (!isUuid(id)) return mobileError("Invoice not found", 404);

    const body = await request.json().catch(() => null);
    const pence = body?.amountPence;
    const result = await recordInvoicePayment(
      { companyId: user.companyId, localUserId: await ensureLocalUser(user) },
      id,
      {
        amountPounds:
          typeof pence === "number" && Number.isFinite(pence) ? (pence / 100).toFixed(2) : "",
        receivedAt: typeof body?.receivedAt === "string" ? body.receivedAt : "",
        reference: typeof body?.reference === "string" ? body.reference : "",
        method: "",
        bankTransactionId: "",
      },
    );
    if (!result.ok) {
      return result.error === "Invoice not found"
        ? mobileError(result.error, 404)
        : mobileFailure(result);
    }
    return NextResponse.json({ success: true, data: { paymentId: result.id } }, { status: 201 });
  } catch (error) {
    return mobileServerError("Record payment error", error);
  }
}
