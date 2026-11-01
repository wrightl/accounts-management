import "server-only";
import { getStorage } from "@/lib/storage";

/**
 * The attached original of an imported invoice, or null to use the generated
 * PDF. Callers fall back if the file has gone, because a record is better than
 * no document at all.
 */
export async function loadOriginalInvoiceDocument(invoice: {
  id: string;
  originalDocumentPath?: string | null;
}): Promise<Uint8Array | null> {
  if (!invoice.originalDocumentPath) return null;
  try {
    const stored = await getStorage().get(invoice.originalDocumentPath);
    return new Uint8Array(stored.body);
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "invoice_original_document_missing",
        invoiceId: invoice.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
