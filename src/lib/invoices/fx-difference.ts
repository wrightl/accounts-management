import "server-only";
import { and, eq, sum } from "drizzle-orm";
import { invoices, invoiceWriteOffs, payments } from "@/db/schema";
import { isForeignDocumentCurrency } from "@/lib/currency";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import type { Tx } from "@/lib/invoices/allocate";
import { invoiceBalance, settlementMinor, settlementPence } from "@/lib/invoices/balance";

export const FX_DIFFERENCE_NOTE = "Exchange difference on settlement";

/**
 * Book the realised exchange gain or loss on a foreign-currency invoice.
 *
 * Once the client has settled the invoice exactly in its own currency, any
 * sterling left over (book value less the pounds actually received, credited
 * and written off) is an exchange difference. It is kept as one signed
 * `fx_difference` write-off: positive is a loss, negative a gain. Call this
 * after every change to an invoice's payments, credits, refunds or write-offs;
 * it removes the row again when the invoice is no longer settled.
 *
 * `onDate` dates a new or changed difference (the day it was settled).
 */
export async function syncFxDifference(
  tx: Tx,
  companyId: string,
  invoiceId: string,
  onDate: string,
): Promise<void> {
  const [inv] = await tx
    .select({
      currency: invoices.currency,
      grossPence: invoices.grossPence,
      grossMinor: invoices.grossMinor,
    })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!inv || !isForeignDocumentCurrency(inv.currency)) return;

  const [paid] = await tx
    .select({
      pence: sum(payments.amountPence).mapWith(Number),
      minor: sum(payments.amountMinor).mapWith(Number),
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.invoiceId, invoiceId), eq(invoices.companyId, companyId)));
  const existing = await tx
    .select({ id: invoiceWriteOffs.id, amountPence: invoiceWriteOffs.amountPence })
    .from(invoiceWriteOffs)
    .where(
      and(
        eq(invoiceWriteOffs.invoiceId, invoiceId),
        eq(invoiceWriteOffs.companyId, companyId),
        eq(invoiceWriteOffs.kind, "fx_difference"),
      ),
    );
  const existingPence = existing.reduce((acc, r) => acc + r.amountPence, 0);

  const adj = await creditAdjustmentForInvoice(tx, companyId, invoiceId);
  const settledExactly =
    inv.grossMinor > 0 && invoiceBalance(settlementMinor(inv, paid?.minor ?? 0, adj)) === 0;
  // Sterling still on the books once the existing difference is taken out.
  const residualPence = settledExactly
    ? invoiceBalance(
        settlementPence(inv, paid?.pence ?? 0, {
          ...adj,
          writtenOffPence: adj.writtenOffPence - existingPence,
        }),
      )
    : 0;

  if (existing.length === 1 && existing[0].amountPence === residualPence) return;
  if (existing.length > 0) {
    await tx
      .delete(invoiceWriteOffs)
      .where(
        and(
          eq(invoiceWriteOffs.invoiceId, invoiceId),
          eq(invoiceWriteOffs.companyId, companyId),
          eq(invoiceWriteOffs.kind, "fx_difference"),
        ),
      );
  }
  if (residualPence === 0) return;
  await tx.insert(invoiceWriteOffs).values({
    companyId,
    invoiceId,
    kind: "fx_difference",
    amountPence: residualPence,
    amountMinor: 0,
    writtenOffOn: onDate,
    note: FX_DIFFERENCE_NOTE,
  });
}
