"use server";

import { mutate } from "@/lib/mutate";
import type { ActionResult } from "@/actions/result";
import { paymentRawFromFormData } from "@/lib/payments/schema";
import { recordInvoicePayment } from "@/lib/payments/record";

export async function recordPayment(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    (ctx) => recordInvoicePayment(ctx, invoiceId, paymentRawFromFormData(formData)),
    {
      paths: ["/invoices", `/invoices/${invoiceId}`, "/transactions", "/dashboard"],
    },
  );
}
