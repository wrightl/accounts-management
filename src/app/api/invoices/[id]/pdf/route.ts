import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { loadOrRenderInvoicePdf } from "@/lib/invoices/pdf-cache";
import { contentDispositionAttachment } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("records:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  if (!user.companyId) {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  }
  const { id } = await context.params;
  const detail = await getInvoiceDetail(user.companyId, id, recordScopeFor(user.role));
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { bytes } = await loadOrRenderInvoicePdf(detail);

  const filename = `${detail.invoice.number}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(filename),
      "Cache-Control": "private, no-store",
    },
  });
}
