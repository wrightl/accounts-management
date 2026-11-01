import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  invoiceImportBatches,
  invoiceImportDrafts,
} from "@/db/schema";
import { getStorage } from "@/lib/storage";

const ABANDONED_AFTER_DAYS = 30;

/** Remove imports abandoned before saving, including their files. */
export async function purgeAbandonedImports(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_DAYS * 86_400_000);
  const batches = await db
    .select({ id: invoiceImportBatches.id, companyId: invoiceImportBatches.companyId })
    .from(invoiceImportBatches)
    .where(
      and(
        eq(invoiceImportBatches.status, "draft"),
        sql`${invoiceImportBatches.createdAt} < ${cutoff.toISOString()}`,
        sql`not exists (select 1 from invoice_import_drafts d where d.batch_id = ${invoiceImportBatches.id} and d.status = 'committed')`,
      ),
    )
    .orderBy(desc(invoiceImportBatches.createdAt))
    .limit(200);
  if (batches.length === 0) return 0;
  const ids = batches.map((b) => b.id);

  const files = await db
    .select({ path: invoiceImportDrafts.documentPath })
    .from(invoiceImportDrafts)
    .where(
      and(
        inArray(invoiceImportDrafts.batchId, ids),
        isNotNull(invoiceImportDrafts.documentPath),
      ),
    );
  await db.transaction(async (tx) => {
    await tx.delete(invoiceImportDrafts).where(inArray(invoiceImportDrafts.batchId, ids));
    await tx
      .update(invoiceImportBatches)
      .set({ status: "discarded" })
      .where(inArray(invoiceImportBatches.id, ids));
    await tx.insert(auditLog).values(
      batches.map((batch) => ({
        companyId: batch.companyId,
        actorUserId: null,
        action: "invoice_import.discard",
        entityType: "invoice_import_batch",
        entityId: batch.id,
        meta: { reason: "abandoned" },
      })),
    );
  });
  for (const file of files) {
    try {
      await getStorage().delete(file.path!);
    } catch {
      /* ignore */
    }
  }
  return batches.length;
}
