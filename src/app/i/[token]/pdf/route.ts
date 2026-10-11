import { NextResponse } from "next/server";
import { getPublicInvoiceByToken } from "@/lib/invoices/public-queries";
import { renderInvoicePdfV2 } from "@/lib/invoices/pdf-v2";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { contentDispositionAttachment } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const data = await getPublicInvoiceByToken(token);
  if (!data || data.suspended) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { detail } = data;
  const company = await getOrCreateCompanySettings(detail.invoice.companyId);
  const bytes = await renderInvoicePdfV2({
    invoice: detail.invoice,
    client: detail.client,
    lines: detail.lines,
    company,
  });
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(`${detail.invoice.number}.pdf`),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
