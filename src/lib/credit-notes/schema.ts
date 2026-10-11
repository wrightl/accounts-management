import { z } from "zod";
import {
  documentLinesSchema,
  parseDocumentLinesJson,
} from "@/lib/documents/schema";
import { todayIsoDate } from "@/lib/dates";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

export const creditNoteSchema = z.object({
  issueDate: z
    .string()
    .trim()
    .min(1, "Issue date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid issue date"),
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason for the credit")
    .max(1000, "Reason must be 1000 characters or fewer"),
  lines: documentLinesSchema,
});

export type CreditNoteParsed = z.infer<typeof creditNoteSchema>;

export function creditNoteRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    issueDate: formData.get("issueDate") || todayIsoDate(),
    reason: formData.get("reason") ?? "",
    lines: parseDocumentLinesJson(formData.get("linesJson")),
  };
}

export function parseCreditNoteInput(raw: unknown) {
  return parseWithFieldErrors(creditNoteSchema, raw);
}

export const creditNoteRefundSchema = z.object({
  amountPounds: z.string().trim().min(1, "Enter the amount refunded"),
  refundedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid refund date"),
  reference: z
    .string()
    .trim()
    .max(200, "Reference must be 200 characters or fewer")
    .optional()
    .transform((v) => (v ? v : null)),
});

export function creditNoteRefundRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    amountPounds: formData.get("amountPounds") ?? "",
    refundedAt: formData.get("refundedAt") || todayIsoDate(),
    reference: formData.get("reference") ?? "",
  };
}

export function parseCreditNoteRefundInput(raw: unknown) {
  return parseWithFieldErrors(creditNoteRefundSchema, raw);
}
