import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, type Company } from "@/db/schema";
import { loadOriginalInvoiceDocument } from "@/lib/invoices/original-document";
import type { getInvoiceDetail } from "@/lib/invoices/queries";
import { renderCompanyInvoicePdf } from "@/lib/pdf/templates/company-render";
import { getCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";

type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;

/** A stored render made since the v2 templates (older paths hold a retired layout). */
function isCachedRender(path: string | null | undefined): path is string {
  return Boolean(path?.includes(".v2."));
}

/**
 * The PDF for an invoice: the original document when one was attached, else
 * the stored render, else a fresh render in the company's current template,
 * which is then stored. Once stored, an invoice keeps that PDF until it is
 * edited, so changing template never restyles an invoice a client already has.
 *
 * Returns the path it was stored at in `storedPath` (null when storing failed).
 */
export async function loadOrRenderInvoicePdf(
  detail: Pick<InvoiceDetail, "invoice" | "client" | "lines">,
  options: { company?: Company } = {},
): Promise<{ bytes: Uint8Array; storedPath: string | null }> {
  const { invoice } = detail;
  const original = await loadOriginalInvoiceDocument(invoice);
  if (original) return { bytes: original, storedPath: invoice.pdfBlobPath };

  // An import's stored PDF could predate the record marking.
  if (invoice.source !== "import" && isCachedRender(invoice.pdfBlobPath)) {
    try {
      const stored = await getStorage().get(invoice.pdfBlobPath);
      return { bytes: new Uint8Array(stored.body), storedPath: invoice.pdfBlobPath };
    } catch {
      // Fall through to render.
    }
  }

  const company = options.company ?? (await getCompanySettings(invoice.companyId));
  const bytes = await renderCompanyInvoicePdf(company, detail);

  try {
    const stored = await getStorage().put(
      `invoices/${invoice.id}.v2.pdf`,
      Buffer.from(bytes),
      "application/pdf",
    );
    await getDb()
      .update(invoices)
      .set({ pdfBlobPath: stored.path })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.companyId, invoice.companyId)));
    return { bytes, storedPath: stored.path };
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "pdf_blob_cache_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { bytes, storedPath: null };
  }
}
