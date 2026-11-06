import "server-only";
import { and, eq, sql, sum } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { invoices, payments, reconciliationMatches } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { poundsToPence } from "@/lib/money";
import {
  getBankTransactionById,
  isBankTransactionAvailable,
  ReconciliationError,
} from "@/lib/bank/queries";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import type { Tx } from "@/lib/invoices/allocate";
import { invoiceBalancePence, isInvoiceSettled } from "@/lib/invoices/balance";
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

  let amountPence: number;
  try {
    amountPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: {
        amountPounds: e instanceof Error ? e.message : "Invalid amount",
      },
    };
  }
  if (amountPence <= 0) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { amountPounds: "Payment amount must be positive" },
    };
  }

  const bankTransactionId = parsed.data.bankTransactionId;
  if (bankTransactionId) {
    const bankTx = await getBankTransactionById(companyId, bankTransactionId);
    if (!bankTx) return { ok: false, error: "Bank transaction not found" };
    if (bankTx.amountPence <= 0) {
      return { ok: false, error: "Only incoming bank transactions can be linked" };
    }
    if (!(await isBankTransactionAvailable(bankTransactionId))) {
      return { ok: false, error: "Bank transaction is already reconciled" };
    }
    if (bankTx.amountPence !== amountPence) {
      return { ok: false, error: "Amount must match the selected bank transaction" };
    }
  }

  const receivedAt = parsed.data.receivedAt
    ? new Date(parsed.data.receivedAt)
    : bankTransactionId
      ? new Date(
          `${(await getBankTransactionById(companyId, bankTransactionId))!.bookedAt}T12:00:00Z`,
        )
      : new Date();
  const locked = await checkPeriodOpen(companyId, receivedAt);
  if (locked) return { ok: false, error: locked };

  const db = getDb();
  let paymentId: string;
  let duplicate = false;
  try {
    paymentId = await db.transaction(async (tx) => {
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

      const [paidRow] = await tx
        .select({ total: sum(payments.amountPence).mapWith(Number) })
        .from(payments)
        .where(eq(payments.invoiceId, invoiceId));
      const alreadyPaid = paidRow?.total ?? 0;
      const credits = await creditAdjustmentForInvoice(tx, invoiceId);
      const remaining = invoiceBalancePence({
        grossPence: inv.grossPence,
        paidPence: alreadyPaid,
        ...credits,
      });
      if (amountPence > remaining) {
        throw new PaymentError(
          `Payment exceeds remaining balance of ${(remaining / 100).toFixed(2)}`,
        );
      }

      if (bankTransactionId) {
        const available = await tx
          .select({ id: reconciliationMatches.id })
          .from(reconciliationMatches)
          .where(eq(reconciliationMatches.bankTransactionId, bankTransactionId))
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

      const paidTotal = alreadyPaid + amountPence;
      if (isInvoiceSettled({ grossPence: inv.grossPence, paidPence: paidTotal, ...credits })) {
        await tx
          .update(invoices)
          .set({ status: "paid", paidAt: receivedAt })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
      }

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
    meta: { invoiceId, amountPence, bankTransactionId },
  });

  return { ok: true, id: paymentId };
}
