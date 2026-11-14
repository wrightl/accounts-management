import { NextResponse } from "next/server";
import { getPublicInvoiceByToken } from "@/lib/invoices/public-queries";
import { loadOrRenderInvoicePdf } from "@/lib/invoices/pdf-cache";
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
  const { bytes } = await loadOrRenderInvoicePdf(detail);
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
