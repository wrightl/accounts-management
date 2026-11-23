import "server-only";
import { and, eq, sql, sum } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { matchOfCompany } from "@/lib/bank/match-scope";
import { invoices, payments, reconciliationMatches } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { formatGBP, formatMoney, poundsToPence } from "@/lib/money";
import {
  getBankTransactionById,
  isBankTransactionAvailable,
  lockBankTransaction,
  ReconciliationError,
} from "@/lib/bank/queries";
import { bankAmountWithinFxBand, gbpAmountBand } from "@/lib/bank/fx";
import { canSettleInvoiceBalance } from "@/lib/bank/match";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import type { Tx } from "@/lib/invoices/allocate";
import { isForeignDocumentCurrency, toSterlingPence } from "@/lib/currency";
import { documentRate } from "@/lib/document-rate";
import { invoiceBalance, isInvoiceSettled, settlementMinor } from "@/lib/invoices/balance";
import { syncFxDifference } from "@/lib/invoices/fx-difference";
import {
  effectiveStatus,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import type { ActionResult } from "@/actions/result";
import { parsePaymentInput } from "@/lib/payments/schema";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import { checkPeriodOpen } from "@/lib/period-lock-queries";

async function findRequestedPayment(
  db: Database | Tx,
  companyId: string,
  invoiceId: string,
  clientRequestId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(payments.invoiceId, invoiceId),
        eq(payments.clientRequestId, clientRequestId),
        eq(invoices.companyId, companyId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

/**
 * Record a payment against a sent invoice, optionally matched to a bank
 * credit, and mark the invoice paid once it's settled. The web action and the
 * mobile route both call this inside their auth checks.
 *
 * With `clientRequestId`, a repeat of the same request returns the payment
 * already recorded (`duplicate: true`) instead of recording a second one.
 */
export async function recordInvoicePayment(
  ctx: { companyId: string; localUserId: string },
  invoiceId: string,
  raw: Record<string, unknown>,
  opts: { clientRequestId?: string | null } = {},
): Promise<ActionResult & { duplicate?: boolean }> {
  const { companyId, localUserId } = ctx;
  const clientRequestId = opts.clientRequestId ?? null;
  // A retry returns the first payment before any check that could now fail,
  // such as the period having been locked since.
  if (clientRequestId) {
    const earlier = await findRequestedPayment(getDb(), companyId, invoiceId, clientRequestId);
    if (earlier) return { ok: true, id: earlier, duplicate: true };
  }
  const parsed = parsePaymentInput(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  // In the invoice's currency.
  let amountMinor: number;
  try {
    amountMinor = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: {
        amountPounds: e instanceof Error ? e.message : "Invalid amount",
      },
    };
  }
  if (amountMinor <= 0) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { amountPounds: "Payment amount must be positive" },
    };
  }

  const [target] = await getDb()
    .select({ currency: invoices.currency, fxRate: invoices.fxRate })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!target) return { ok: false, error: "Invoice not found" };
  const foreign = isForeignDocumentCurrency(target.currency);

  const bankTransactionId = parsed.data.bankTransactionId;
  const bankTx = bankTransactionId
    ? await getBankTransactionById(companyId, bankTransactionId)
    : null;
  if (bankTransactionId) {
    if (!bankTx) return { ok: false, error: "Bank transaction not found" };
    if (bankTx.amountPence <= 0) {
      return { ok: false, error: "Only incoming bank transactions can be linked" };
    }
    if (!(await isBankTransactionAvailable(companyId, bankTransactionId))) {
      return { ok: false, error: "Bank transaction is already reconciled" };
    }
    // A foreign payment's sterling is the bank line, whatever the client paid in their currency.
    if (!foreign && bankTx.amountPence !== amountMinor) {
      return { ok: false, error: "Amount must match the selected bank transaction" };
    }
  }

  const receivedAt = parsed.data.receivedAt
    ? new Date(parsed.data.receivedAt)
    : bankTx
      ? new Date(`${bankTx.bookedAt}T12:00:00Z`)
      : new Date();
  const locked = await checkPeriodOpen(companyId, receivedAt);
  if (locked) return { ok: false, error: locked };

  // The sterling the payment brought in: the bank line when linked, else what
  // the user says reached the bank, else an estimate at the Bank of England
  // rate for the day, flagged until a bank line confirms it.
  let amountPence = amountMinor;
  let amountPenceEstimated = false;
  if (foreign) {
    if (bankTx) {
      // The same ±10% band every other bank link for a foreign payment uses.
      const rate = await documentRate(target.currency, todayIsoDate(receivedAt));
      const expected = toSterlingPence(amountMinor, rate.ok ? rate.rate.fxRate : target.fxRate);
      if (!bankAmountWithinFxBand(bankTx.amountPence, gbpAmountBand(expected))) {
        return {
          ok: false,
          error: `${formatGBP(bankTx.amountPence)} is too far from the ${formatGBP(expected)} expected for ${formatMoney(amountMinor, target.currency)} to link`,
        };
      }
      amountPence = bankTx.amountPence;
    } else if (parsed.data.sterlingPounds) {
      try {
        amountPence = poundsToPence(parsed.data.sterlingPounds);
      } catch (e) {
        return {
          ok: false,
          error: FORM_FIELD_ERROR_SUMMARY,
          fieldErrors: { sterlingPounds: e instanceof Error ? e.message : "Invalid amount" },
        };
      }
      if (amountPence <= 0) {
        return {
          ok: false,
          error: FORM_FIELD_ERROR_SUMMARY,
          fieldErrors: { sterlingPounds: "Enter the amount in pounds that reached your bank" },
        };
      }
    } else {
      const rate = await documentRate(target.currency, todayIsoDate(receivedAt));
      amountPence = toSterlingPence(amountMinor, rate.ok ? rate.rate.fxRate : target.fxRate);
      amountPenceEstimated = true;
    }
  }

  const db = getDb();
  let paymentId: string;
  let duplicate = false;
  try {
    paymentId = await db.transaction(async (tx) => {
      // Bank transaction first, then invoice: the order every bank link uses.
      if (bankTransactionId && !(await lockBankTransaction(tx, companyId, bankTransactionId))) {
        throw new PaymentError("Bank transaction not found");
      }
      await tx.execute(
        sql`select id from invoices where id = ${invoiceId} and company_id = ${companyId} for update`,
      );

      // Two copies of the same request at once: the second waits on the lock.
      if (clientRequestId) {
        const existing = await findRequestedPayment(tx, companyId, invoiceId, clientRequestId);
        if (existing) {
          duplicate = true;
          return existing;
        }
      }

      const [inv] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!inv) throw new PaymentError("Invoice not found");

      const status = effectiveStatus(
        inv.status as InvoiceStatus,
        inv.dueDate,
        todayIsoDate(),
      );
      if (status === "draft" || status === "void" || status === "paid") {
        throw new PaymentError(`Cannot record a payment against a ${status} invoice`);
      }
      if (inv.currency !== target.currency) {
        throw new PaymentError("The invoice changed while you were recording this. Try again.");
      }

      const [paidRow] = await tx
        .select({ total: sum(payments.amountMinor).mapWith(Number) })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(and(eq(payments.invoiceId, invoiceId), eq(invoices.companyId, companyId)));
      const alreadyPaid = paidRow?.total ?? 0;
      const credits = await creditAdjustmentForInvoice(tx, companyId, invoiceId);
      const remaining = invoiceBalance(settlementMinor(inv, alreadyPaid, credits));
      // Money already in the bank can be a little more than the balance; the
      // extra then shows as a refund due on the invoice.
      const overBalance = bankTransactionId
        ? remaining <= 0 || !canSettleInvoiceBalance(amountMinor, remaining)
        : amountMinor > remaining;
      if (overBalance) {
        throw new PaymentError(
          `Payment exceeds remaining balance of ${(remaining / 100).toFixed(2)}`,
        );
      }

      if (bankTransactionId) {
        const available = await tx
          .select({ id: reconciliationMatches.id })
          .from(reconciliationMatches)
          .where(
            and(
              eq(reconciliationMatches.bankTransactionId, bankTransactionId),
              matchOfCompany(companyId),
            ),
          )
          .limit(1);
        if (available[0]) {
          throw new PaymentError("Bank transaction is already reconciled");
        }
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          invoiceId,
          amountPence,
          amountMinor,
          amountPenceEstimated,
          method: parsed.data.method ?? "bank_transfer",
          reference: parsed.data.reference,
          receivedAt,
          clientRequestId,
        })
        .returning({ id: payments.id });

      if (bankTransactionId) {
        await tx.insert(reconciliationMatches).values({
          bankTransactionId,
          matchType: "invoice_payment",
          paymentId: payment.id,
          invoiceId,
          confirmed: true,
        });
      }

      const paidTotal = alreadyPaid + amountMinor;
      if (isInvoiceSettled(settlementMinor(inv, paidTotal, credits))) {
        await tx
          .update(invoices)
          .set({ status: "paid", paidAt: receivedAt })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
      }
      await syncFxDifference(tx, companyId, invoiceId, todayIsoDate(receivedAt));

      return payment.id;
    });
  } catch (e) {
    if (e instanceof PaymentError) return { ok: false, error: e.message };
    if (e instanceof ReconciliationError) return { ok: false, error: e.message };
    throw e;
  }

  if (duplicate) return { ok: true, id: paymentId, duplicate: true };

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "payment.record",
    entityType: "payment",
    entityId: paymentId,
    meta: { invoiceId, amountPence, amountMinor, bankTransactionId },
  });

  return { ok: true, id: paymentId };
}
