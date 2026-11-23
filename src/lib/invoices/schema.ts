import { z } from "zod";
import {
  documentLineSchema,
  parseDocumentLinesJson,
} from "@/lib/documents/schema";
import { DOCUMENT_CURRENCIES, STERLING } from "@/lib/currency";
import { todayIsoDate } from "@/lib/dates";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

const optionalNotes = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : (v ?? null)));

/** A document's currency: one of DOCUMENT_CURRENCIES, sterling when blank. */
export const documentCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => v || STERLING)
  .refine((v) => DOCUMENT_CURRENCIES.includes(v), "Choose one of the listed currencies");

/**
 * A rate typed by hand, in units of the document currency per £1. Blank means
 * use the Bank of England rate for the issue date.
 */
export const manualFxRateSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v == null || String(v).trim() === "" ? null : Number(String(v).trim())))
  .refine((v) => v == null || (Number.isFinite(v) && v > 0), "Enter an exchange rate above 0");

export const invoiceSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Choose a client")
    .uuid("Choose a client"),
  issueDate: z
    .string()
    .trim()
    .min(1, "Issue date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid issue date"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid due date")
    .optional()
    .or(z.literal("")),
  notes: optionalNotes,
  currency: documentCurrencySchema,
  fxRate: manualFxRateSchema,
  lines: z
    .array(
      documentLineSchema.extend({
        /** Set when the line recharges a rebillable expense. */
        expenseId: z.string().uuid().optional(),
      }),
    )
    .min(1, "Add at least one line item"),
});

export type InvoiceParsed = z.infer<typeof invoiceSchema>;

export function invoiceRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    dueDate: formData.get("dueDate") ?? "",
    notes: formData.get("notes") ?? "",
    currency: formData.get("currency") ?? "",
    fxRate: formData.get("fxRate") ?? "",
    lines: parseDocumentLinesJson(formData.get("linesJson")),
  };
}

export function parseInvoiceInput(raw: unknown) {
  return parseWithFieldErrors(invoiceSchema, raw);
}
