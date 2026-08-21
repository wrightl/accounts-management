import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import {
  getInvoiceDetail,
  getOrCreateCompanySettings,
} from "@/lib/invoices/queries";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("accounts:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const { id } = await context.params;
  const detail = await getInvoiceDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let bytes: Uint8Array;

  if (detail.invoice.pdfBlobPath) {
    try {
      const storage = getStorage();
      const obj = await storage.get(detail.invoice.pdfBlobPath);
      bytes = new Uint8Array(obj.body);
    } catch {
      // Fall through to regenerate if blob is missing.
      bytes = await generatePdf(detail);
    }
  } else {
    bytes = await generatePdf(detail);
  }

  const filename = `${detail.invoice.number}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function generatePdf(
  detail: NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>,
) {
  const company = await getOrCreateCompanySettings();
  const bytes = await renderInvoicePdf({
    invoice: detail.invoice,
    client: detail.client,
    lines: detail.lines,
    company,
  });

  // Cache draft PDFs on first download so subsequent downloads are cheap.
  try {
    const storage = getStorage();
    const stored = await storage.put(
      `invoices/${detail.invoice.id}.pdf`,
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
