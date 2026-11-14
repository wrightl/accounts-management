import "server-only";
import { and, eq, inArray, sum } from "drizzle-orm";
import type { Database } from "@/db";
import { creditNotes, invoiceWriteOffs } from "@/db/schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type CreditAdjustment = {
  creditedPence: number;
  refundedPence: number;
  /** Shortfall written off as bank charges or bad debt. */
  writtenOffPence: number;
};

const NONE: CreditAdjustment = { creditedPence: 0, refundedPence: 0, writtenOffPence: 0 };

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
        credited: sum(creditNotes.grossPence).mapWith(Number),
        refunded: sum(creditNotes.refundedPence).mapWith(Number),
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
        total: sum(invoiceWriteOffs.amountPence).mapWith(Number),
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
      e = { ...NONE };
      map.set(id, e);
    }
    return e;
  };
  for (const r of creditRows) {
    const e = entry(r.invoiceId);
    e.creditedPence = r.credited ?? 0;
    e.refundedPence = r.refunded ?? 0;
  }
  for (const r of writeOffRows) entry(r.invoiceId).writtenOffPence = r.total ?? 0;
  return map;
}

/** Credited, refunded and written-off totals for one invoice. */
export async function creditAdjustmentForInvoice(
  db: Database | Tx,
  companyId: string,
  invoiceId: string,
): Promise<CreditAdjustment> {
  const map = await creditAdjustmentsByInvoice(db, companyId, [invoiceId]);
  return map.get(invoiceId) ?? NONE;
}
