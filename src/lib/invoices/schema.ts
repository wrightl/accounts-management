import { z } from "zod";
import {
  documentLinesSchema,
  parseDocumentLinesJson,
} from "@/lib/documents/schema";
import { todayIsoDate } from "@/lib/dates";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

const optionalNotes = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : (v ?? null)));

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
  lines: documentLinesSchema,
});

export type InvoiceParsed = z.infer<typeof invoiceSchema>;

export function invoiceRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    dueDate: formData.get("dueDate") ?? "",
    notes: formData.get("notes") ?? "",
    lines: parseDocumentLinesJson(formData.get("linesJson")),
  };
}

export function parseInvoiceInput(raw: unknown) {
  return parseWithFieldErrors(invoiceSchema, raw);
}
