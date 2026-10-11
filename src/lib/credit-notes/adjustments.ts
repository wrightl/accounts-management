import "server-only";
import { and, eq, inArray, sum } from "drizzle-orm";
import type { Database } from "@/db";
import { creditNotes } from "@/db/schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type CreditAdjustment = { creditedPence: number; refundedPence: number };

const NONE: CreditAdjustment = { creditedPence: 0, refundedPence: 0 };

/** Credited and refunded totals per invoice from issued credit notes. */
export async function creditAdjustmentsByInvoice(
  db: Database | Tx,
  invoiceIds: string[],
): Promise<Map<string, CreditAdjustment>> {
  const map = new Map<string, CreditAdjustment>();
  if (invoiceIds.length === 0) return map;
  const rows = await db
    .select({
      invoiceId: creditNotes.invoiceId,
      credited: sum(creditNotes.grossPence).mapWith(Number),
      refunded: sum(creditNotes.refundedPence).mapWith(Number),
    })
    .from(creditNotes)
    .where(and(inArray(creditNotes.invoiceId, invoiceIds), eq(creditNotes.status, "issued")))
    .groupBy(creditNotes.invoiceId);
  for (const r of rows) {
    map.set(r.invoiceId, { creditedPence: r.credited ?? 0, refundedPence: r.refunded ?? 0 });
  }
  return map;
}

/** Credited and refunded totals for one invoice. */
export async function creditAdjustmentForInvoice(
  db: Database | Tx,
  invoiceId: string,
): Promise<CreditAdjustment> {
  const map = await creditAdjustmentsByInvoice(db, [invoiceId]);
  return map.get(invoiceId) ?? NONE;
}
