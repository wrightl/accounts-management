import "server-only";
import { and, eq, inArray, sum } from "drizzle-orm";
import type { Database } from "@/db";
import { creditNotes, invoiceWriteOffs } from "@/db/schema";
import { NO_CREDIT_ADJUSTMENT, type CreditAdjustment } from "@/lib/invoices/balance";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type { CreditAdjustment };

/** Credited, refunded and written-off totals per invoice of the company. */
export async function creditAdjustmentsByInvoice(
  db: Database | Tx,
  companyId: string,
  invoiceIds: string[],
): Promise<Map<string, CreditAdjustment>> {
  const map = new Map<string, CreditAdjustment>();
  if (invoiceIds.length === 0) return map;
  const [creditRows, writeOffRows] = await Promise.all([
    db
      .select({
        invoiceId: creditNotes.invoiceId,
        creditedPence: sum(creditNotes.grossPence).mapWith(Number),
        refundedPence: sum(creditNotes.refundedPence).mapWith(Number),
        creditedMinor: sum(creditNotes.grossMinor).mapWith(Number),
        refundedMinor: sum(creditNotes.refundedMinor).mapWith(Number),
      })
      .from(creditNotes)
      .where(
        and(
          inArray(creditNotes.invoiceId, invoiceIds),
          eq(creditNotes.companyId, companyId),
          eq(creditNotes.status, "issued"),
        ),
      )
      .groupBy(creditNotes.invoiceId),
    db
      .select({
        invoiceId: invoiceWriteOffs.invoiceId,
        totalPence: sum(invoiceWriteOffs.amountPence).mapWith(Number),
        totalMinor: sum(invoiceWriteOffs.amountMinor).mapWith(Number),
      })
      .from(invoiceWriteOffs)
      .where(
        and(
          inArray(invoiceWriteOffs.invoiceId, invoiceIds),
          eq(invoiceWriteOffs.companyId, companyId),
        ),
      )
      .groupBy(invoiceWriteOffs.invoiceId),
  ]);
  const entry = (id: string) => {
    let e = map.get(id);
    if (!e) {
      e = { ...NO_CREDIT_ADJUSTMENT };
      map.set(id, e);
    }
    return e;
  };
  for (const r of creditRows) {
    const e = entry(r.invoiceId);
    e.creditedPence = r.creditedPence ?? 0;
    e.refundedPence = r.refundedPence ?? 0;
    e.creditedMinor = r.creditedMinor ?? 0;
    e.refundedMinor = r.refundedMinor ?? 0;
  }
  for (const r of writeOffRows) {
    const e = entry(r.invoiceId);
    e.writtenOffPence = r.totalPence ?? 0;
    e.writtenOffMinor = r.totalMinor ?? 0;
  }
  return map;
}

/** Credited, refunded and written-off totals for one invoice. */
export async function creditAdjustmentForInvoice(
  db: Database | Tx,
  companyId: string,
  invoiceId: string,
): Promise<CreditAdjustment> {
  const map = await creditAdjustmentsByInvoice(db, companyId, [invoiceId]);
  return map.get(invoiceId) ?? NO_CREDIT_ADJUSTMENT;
}
