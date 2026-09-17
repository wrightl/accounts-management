import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { renderInvoicePdfV2 } from "@/lib/invoices/pdf-v2";
import { getStorage } from "@/lib/storage";
import { contentDispositionAttachment } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cached invoice PDF path for the v2 template (avoids serving legacy layouts). */
function isV2PdfCache(path: string | null | undefined): boolean {
  return Boolean(path?.includes(".v2."));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("accounts:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  if (!user.companyId) {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  }
  const companyId = user.companyId;

  const { id } = await context.params;
  const detail = await getInvoiceDetail(companyId, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let bytes: Uint8Array;

  if (isV2PdfCache(detail.invoice.pdfBlobPath)) {
    try {
      const storage = getStorage();
      const obj = await storage.get(detail.invoice.pdfBlobPath!);
      bytes = new Uint8Array(obj.body);
    } catch {
      bytes = await generatePdf(companyId, detail);
    }
  } else {
    bytes = await generatePdf(companyId, detail);
  }

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

async function generatePdf(
  companyId: string,
  detail: NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>,
) {
  const company = await getOrCreateCompanySettings(companyId);
  const bytes = await renderInvoicePdfV2({
    invoice: detail.invoice,
    client: detail.client,
    lines: detail.lines,
    company,
  });

  try {
    const storage = getStorage();
    const stored = await storage.put(
      `invoices/${detail.invoice.id}.v2.pdf`,
      Buffer.from(bytes),
      "application/pdf",
    );
    const db = getDb();
    await db
      .update(invoices)
      .set({ pdfBlobPath: stored.path })
      .where(eq(invoices.id, detail.invoice.id));
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "pdf_blob_cache_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return bytes;
}
