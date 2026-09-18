import { NextResponse } from "next/server";
import { getPublicQuoteByToken } from "@/lib/quotes/public-queries";
import { loadOrRenderQuotePdf } from "@/lib/quotes/pdf-cache";
import { contentDispositionAttachment } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const data = await getPublicQuoteByToken(token);
  if (!data || data.suspended) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { bytes, filename } = await loadOrRenderQuotePdf(
      data.detail.quote.companyId,
      data.detail.quote.id,
    );
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDispositionAttachment(filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to render PDF";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
