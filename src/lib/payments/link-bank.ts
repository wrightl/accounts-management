import "server-only";
import { and, eq, inArray, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { matchOfCompany } from "@/lib/bank/match-scope";
import { invoices, payments, reconciliationMatches } from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import { writeAudit } from "@/lib/audit";
import { canSettleInvoiceBalance, dateDiffDays } from "@/lib/bank/match";
import {
  getBankTransactionById,
  listUnmatchedIncomingTransactions,
  lockBankTransaction,
  ReconciliationError,
} from "@/lib/bank/queries";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import type { Tx } from "@/lib/invoices/allocate";
import { isForeignDocumentCurrency } from "@/lib/currency";
import { invoiceBalance, isInvoiceSettled, settlementMinor } from "@/lib/invoices/balance";
import { syncFxDifference } from "@/lib/invoices/fx-difference";
import { storedStatus } from "@/lib/invoices/status";
import { formatGBP } from "@/lib/money";
import { checkPeriodOpen } from "@/lib/period-lock-queries";

class LinkError extends Error {}

export type LinkableReceipt = {
  bankTransactionId: string;
  bookedAt: string;
  amountPence: number;
  amountFormatted: string;
  counterparty: string | null;
  reference: string | null;
};

/** A payment on one of the company's invoices, with the invoice it belongs to. */
async function loadPayment(db: ReturnType<typeof getDb> | Tx, companyId: string, paymentId: string) {
  const [row] = await db
    .select({ payment: payments, invoice: invoices })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.id, paymentId), eq(invoices.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

async function invoiceSettlement(
  tx: ReturnType<typeof getDb> | Tx,
  inv: typeof invoices.$inferSelect,
) {
  const [paid] = await tx
    .select({ total: sum(payments.amountMinor).mapWith(Number) })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.invoiceId, inv.id), eq(invoices.companyId, inv.companyId)));
  return settlementMinor(
    inv,
    paid?.total ?? 0,
    await creditAdjustmentForInvoice(tx, inv.companyId, inv.id),
  );
}

/**
 * The most a bank receipt can be when linked to this payment: the payment plus
 * whatever is still owed, with the usual overpayment allowance on top.
 */
function receiptFits(amountPence: number, paymentPence: number, owedPence: number): boolean {
  return canSettleInvoiceBalance(amountPence, paymentPence + Math.max(0, owedPence));
}

/** Whether a confirmed bank match already settles this payment. */
async function paymentIsLinked(
  db: ReturnType<typeof getDb> | Tx,
  companyId: string,
  paymentId: string,
) {
  const [row] = await db
    .select({ id: reconciliationMatches.id })
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.paymentId, paymentId),
        eq(reconciliationMatches.confirmed, true),
        matchOfCompany(companyId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Unlinked bank credits that could be this payment, closest first: the exact
 * amount, then nearest to the payment's date.
 */
export async function listReceiptsForPayment(
  companyId: string,
  paymentId: string,
  limit = 100,
): Promise<LinkableReceipt[]> {
  const db = getDb();
  const row = await loadPayment(db, companyId, paymentId);
  if (!row || row.payment.stripeCheckoutSessionId) return [];
  // Foreign-currency receipts are matched on a rate band, which comes later.
  if (isForeignDocumentCurrency(row.invoice.currency)) return [];
  const owed = invoiceBalance(await invoiceSettlement(db, row.invoice));
  const paidOn = row.payment.receivedAt.toISOString().slice(0, 10);

  const unmatched = await listUnmatchedIncomingTransactions(companyId);
  return unmatched
    .map(({ tx }) => tx)
    .filter((tx) => receiptFits(tx.amountPence, row.payment.amountPence, owed))
    .sort((a, b) => {
      const exactA = a.amountPence === row.payment.amountPence ? 0 : 1;
      const exactB = b.amountPence === row.payment.amountPence ? 0 : 1;
      return (
        exactA - exactB ||
        Math.abs(dateDiffDays(a.bookedAt, paidOn)) - Math.abs(dateDiffDays(b.bookedAt, paidOn))
      );
    })
    .slice(0, limit)
    .map((tx) => ({
      bankTransactionId: tx.id,
      bookedAt: tx.bookedAt,
      amountPence: tx.amountPence,
      amountFormatted: formatGBP(tx.amountPence),
      counterparty: tx.counterparty,
      reference: tx.reference,
    }));
}

/**
 * Reconcile a payment already on an invoice (such as one recorded by an
 * invoice import) to the bank credit that paid it. When the bank amount
 * differs, the payment becomes what was actually received: an overpayment then
 * shows as a refund due, a shortfall as a balance still owed.
 */
export async function linkPaymentToBankTransaction(
  ctx: { companyId: string; localUserId: string },
  paymentId: string,
  bankTransactionId: string,
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const db = getDb();
  const found = await loadPayment(db, companyId, paymentId);
  if (!found) return { ok: false, error: "Payment not found" };
  if (found.payment.stripeCheckoutSessionId) {
    return { ok: false, error: "Card payments are settled by Stripe payouts, not linked one by one" };
  }
  const bankTx = await getBankTransactionById(companyId, bankTransactionId);
  if (!bankTx) return { ok: false, error: "Bank transaction not found" };
  if (bankTx.amountPence <= 0) {
    return { ok: false, error: "Only incoming bank transactions can be linked" };
  }
  if (isForeignDocumentCurrency(found.invoice.currency)) {
    return {
      ok: false,
      error: `Linking bank lines to ${found.invoice.currency} payments isn't supported yet`,
    };
  }

  const before = found.payment.amountPence;
  const amountChanges = bankTx.amountPence !== before;
  if (amountChanges) {
    const locked = await checkPeriodOpen(companyId, found.payment.receivedAt);
    if (locked) return { ok: false, error: locked };
  }

  try {
    await db.transaction(async (tx) => {
      // Bank transaction first, then invoice: the order every bank link uses.
      if (!(await lockBankTransaction(tx, companyId, bankTransactionId))) {
        throw new LinkError("Bank transaction not found");
      }
      await tx.execute(
        sql`select id from invoices where id = ${found.invoice.id} and company_id = ${companyId} for update`,
      );
      const current = await loadPayment(tx, companyId, paymentId);
      if (!current) throw new LinkError("Payment not found");
      const inv = current.invoice;
      if (storedStatus(inv.status) === "void" || storedStatus(inv.status) === "draft") {
        throw new LinkError(`Can't link a payment on a ${storedStatus(inv.status)} invoice`);
      }
      if (await paymentIsLinked(tx, companyId, paymentId)) {
        throw new LinkError("This payment is already linked to a bank transaction");
      }
      const [taken] = await tx
        .select({ id: reconciliationMatches.id, paymentId: reconciliationMatches.paymentId })
        .from(reconciliationMatches)
        .where(
          and(
            eq(reconciliationMatches.bankTransactionId, bankTransactionId),
            matchOfCompany(companyId),
          ),
        )
        .limit(1);
      // A pending suggestion for this same payment is replaced; anything else means it's used.
      if (taken && taken.paymentId !== paymentId) {
        throw new LinkError("Bank transaction is already reconciled");
      }

      const owed = invoiceBalance(await invoiceSettlement(tx, inv));
      if (!receiptFits(bankTx.amountPence, current.payment.amountPence, owed)) {
        throw new LinkError(
          `${formatGBP(bankTx.amountPence)} is too far from the ${formatGBP(current.payment.amountPence)} payment to link`,
        );
      }

      // Pending suggestions for this payment are superseded by the link.
      await tx
        .delete(reconciliationMatches)
        .where(
          and(
            eq(reconciliationMatches.paymentId, paymentId),
            eq(reconciliationMatches.confirmed, false),
            matchOfCompany(companyId),
          ),
        );

      if (amountChanges) {
        await tx
          .update(payments)
          // Sterling invoice (checked above), so the two amounts move together.
          .set({ amountPence: bankTx.amountPence, amountMinor: bankTx.amountPence })
          .where(
            and(
              eq(payments.id, paymentId),
              inArray(
                payments.invoiceId,
                tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId)),
              ),
            ),
          );
      }
      await tx.insert(reconciliationMatches).values({
        bankTransactionId,
        matchType: "invoice_payment",
        paymentId,
        invoiceId: inv.id,
        confirmed: true,
        note: amountChanges
          ? `Payment changed from ${formatGBP(before)} to the ${formatGBP(bankTx.amountPence)} received.`
          : null,
      });

      const settled = isInvoiceSettled(await invoiceSettlement(tx, inv));
      const status = storedStatus(inv.status);
      if (settled && status === "sent") {
        await tx
          .update(invoices)
          .set({ status: "paid", paidAt: current.payment.receivedAt })
          .where(and(eq(invoices.id, inv.id), eq(invoices.companyId, companyId)));
      } else if (!settled && status === "paid") {
        await tx
          .update(invoices)
          .set({ status: "sent", paidAt: null })
          .where(and(eq(invoices.id, inv.id), eq(invoices.companyId, companyId)));
      }
      // The sterling received may have changed, and with it any exchange difference.
      await syncFxDifference(tx, companyId, inv.id, bankTx.bookedAt);
    });
  } catch (e) {
    if (e instanceof LinkError || e instanceof ReconciliationError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "payment.link_bank",
    entityType: "payment",
    entityId: paymentId,
    meta: {
      invoiceId: found.invoice.id,
      bankTransactionId,
      amountPence: bankTx.amountPence,
      previousAmountPence: amountChanges ? before : undefined,
    },
  });
  return { ok: true, id: paymentId };
}

/** Ids of the invoice's payments that a confirmed bank match already settles. */
export async function linkedPaymentIds(companyId: string, invoiceId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ paymentId: reconciliationMatches.paymentId })
    .from(reconciliationMatches)
    .innerJoin(payments, eq(payments.id, reconciliationMatches.paymentId))
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(payments.invoiceId, invoiceId),
        eq(invoices.companyId, companyId),
        eq(reconciliationMatches.confirmed, true),
      ),
    );
  return new Set(rows.flatMap((r) => (r.paymentId ? [r.paymentId] : [])));
}
