"use server";

import { mutate } from "@/lib/mutate";
import type { ActionResult } from "@/actions/result";
import { paymentRawFromFormData } from "@/lib/payments/schema";
import { recordInvoicePayment } from "@/lib/payments/record";
import { requireActionPermission } from "@/lib/auth";
import {
  linkPaymentToBankTransaction,
  listReceiptsForPayment,
  type LinkableReceipt,
} from "@/lib/payments/link-bank";
import {
  removeInvoiceWriteOff,
  writeOffInvoiceBalance,
  writeOffRawFromFormData,
} from "@/lib/invoices/write-offs";

function invoicePaths(invoiceId: string) {
  return ["/invoices", `/invoices/${invoiceId}`, "/transactions", "/dashboard"];
}

export async function recordPayment(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    (ctx) => recordInvoicePayment(ctx, invoiceId, paymentRawFromFormData(formData)),
    {
      paths: invoicePaths(invoiceId),
    },
  );
}

/** Write off part of an invoice's balance as bank charges or bad debt. */
export async function writeOffInvoice(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    (ctx) => writeOffInvoiceBalance(ctx, invoiceId, writeOffRawFromFormData(formData)),
    { paths: invoicePaths(invoiceId) },
  );
}

/** Undo a write-off; the amount is owed on the invoice again. */
export async function removeWriteOff(
  invoiceId: string,
  writeOffId: string,
): Promise<ActionResult> {
  return mutate("accounts:write", (ctx) => removeInvoiceWriteOff(ctx, writeOffId), {
    paths: invoicePaths(invoiceId),
  });
}

/** Unlinked bank credits that could be this payment, closest first. */
export async function findReceiptsForPayment(
  paymentId: string,
): Promise<{ ok: true; receipts: LinkableReceipt[] } | { ok: false; error: string }> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  return { ok: true, receipts: await listReceiptsForPayment(authz.user.companyId, paymentId) };
}

/** Reconcile a payment already on the invoice to the bank credit that paid it. */
export async function linkPaymentToBank(
  invoiceId: string,
  paymentId: string,
  bankTransactionId: string,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    (ctx) => linkPaymentToBankTransaction(ctx, paymentId, bankTransactionId),
    { paths: invoicePaths(invoiceId) },
  );
}
