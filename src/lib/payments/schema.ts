import { z } from "zod";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

export const paymentSchema = z.object({
  /** In the invoice's currency. */
  amountPounds: z.string().trim().min(1, "Enter a payment amount"),
  /**
   * Foreign-currency invoices: the sterling that reached the bank. Blank means
   * estimate it at the Bank of England rate until a bank line confirms it.
   */
  sterlingPounds: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : (v ?? null))),
  method: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : (v ?? null))),
  reference: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : (v ?? null))),
  receivedAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : (v ?? null))),
  bankTransactionId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : (v ?? null))),
});

export type PaymentParsed = z.infer<typeof paymentSchema>;

export function paymentRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    amountPounds: formData.get("amountPounds"),
    sterlingPounds: formData.get("sterlingPounds") ?? "",
    method: formData.get("method") ?? "",
    reference: formData.get("reference") ?? "",
    receivedAt: formData.get("receivedAt") ?? "",
    bankTransactionId: formData.get("bankTransactionId") ?? "",
  };
}

export function parsePaymentInput(raw: unknown) {
  return parseWithFieldErrors(paymentSchema, raw);
}
