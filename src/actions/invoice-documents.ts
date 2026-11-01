"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, invoices } from "@/db/schema";
import { MAX_RECEIPT_BYTES, sniffReceiptContentType } from "@/lib/expenses/receipt-file";
import { mutate } from "@/lib/mutate";
import { getStorage } from "@/lib/storage";
import type { ActionResult } from "@/actions/result";

async function deleteQuietly(path: string | null) {
  if (!path) return;
  try {
    await getStorage().delete(path);
  } catch {
    /* ignore */
  }
}

async function loadImportedInvoice(companyId: string, id: string) {
  const [invoice] = await getDb()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
    .limit(1);
  return invoice?.source === "import" ? invoice : null;
}

/** Attach or replace the original PDF of an imported invoice. */
export async function attachInvoiceDocument(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF file" };
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return { ok: false, error: "The PDF can be up to 4.5 MB" };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sniffReceiptContentType(bytes) !== "application/pdf") {
    return { ok: false, error: "The original must be a PDF" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const invoice = await loadImportedInvoice(companyId, id);
      if (!invoice) return { ok: false, error: "Imported invoice not found" };

      const stored = await getStorage().put(
        `invoice-originals/${companyId}/${id}/${randomUUID()}.pdf`,
        bytes,
        "application/pdf",
      );
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await getDb().transaction(async (tx) => {
        await tx
          .update(invoices)
          .set({
            originalDocumentPath: stored.path,
            originalDocumentFilename: file.name,
            originalDocumentSize: bytes.byteLength,
            originalDocumentSha256: sha256,
          })
          .where(eq(invoices.id, id));
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: localUserId,
          action: "invoice.document_attach",
          entityType: "invoice",
          entityId: id,
          meta: { filename: file.name, sha256 },
        });
      });
      await deleteQuietly(invoice.originalDocumentPath);
      return { ok: true, id };
    },
    { paths: [`/invoices/${id}`] },
  );
}

/** Remove the original, so the invoice's PDF becomes the generated record. */
export async function removeInvoiceDocument(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const invoice = await loadImportedInvoice(companyId, id);
      if (!invoice) return { ok: false, error: "Imported invoice not found" };
      if (!invoice.originalDocumentPath) return { ok: true, id };

      await getDb().transaction(async (tx) => {
        await tx
          .update(invoices)
          .set({
            originalDocumentPath: null,
            originalDocumentFilename: null,
            originalDocumentSize: null,
            originalDocumentSha256: null,
          })
          .where(eq(invoices.id, id));
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: localUserId,
          action: "invoice.document_remove",
          entityType: "invoice",
          entityId: id,
          meta: { filename: invoice.originalDocumentFilename },
        });
      });
      await deleteQuietly(invoice.originalDocumentPath);
      return { ok: true, id };
    },
    { paths: [`/invoices/${id}`] },
  );
}
