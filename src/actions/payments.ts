"use server";

import { and, eq, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, payments, reconciliationMatches } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { poundsToPence } from "@/lib/money";
import {
  getBankTransactionById,
  isBankTransactionAvailable,
  ReconciliationError,
} from "@/lib/bank/queries";
import {
  effectiveStatus,
  isFullySettled,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import type { ActionResult } from "@/actions/result";
import {
  parsePaymentInput,
  paymentRawFromFormData,
} from "@/lib/payments/schema";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";

class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export async function recordPayment(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parsePaymentInput(paymentRawFromFormData(formData));
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

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
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

      const db = getDb();
      let paymentId: string;
      try {
        paymentId = await db.transaction(async (tx) => {
          await tx.execute(
            sql`select id from invoices where id = ${invoiceId} for update`,
          );

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
          const remaining = inv.grossPence - alreadyPaid;
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
          if (isFullySettled(inv.grossPence, paidTotal)) {
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

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "payment.record",
        entityType: "payment",
        entityId: paymentId,
        meta: { invoiceId, amountPence, bankTransactionId },
      });

      return { ok: true, id: paymentId };
    },
    {
      paths: ["/invoices", `/invoices/${invoiceId}`, "/transactions", "/dashboard"],
    },
  );
}
