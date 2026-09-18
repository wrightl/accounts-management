import { z } from "zod";
import { parseDocumentLinesJson } from "@/lib/documents/schema";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

const recurringLineSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Enter a description")
    .max(500, "Description must be 500 characters or fewer"),
  quantity: z.coerce
    .number({ error: "Enter a valid quantity" })
    .positive("Quantity must be greater than 0")
    .max(1_000_000, "Quantity is too large"),
  unitPricePounds: z.string().trim().min(1, "Enter a unit price"),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
});

export const recurringInvoiceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(200, "Name must be 200 characters or fewer"),
  clientId: z
    .string()
    .trim()
    .min(1, "Choose a client")
    .uuid("Choose a client"),
  notes: z
    .string()
    .max(5000, "Notes must be 5000 characters or fewer")
    .optional()
    .nullable(),
  dayOfMonth: z.coerce
    .number({ error: "Enter a day of the month" })
    .int()
    .min(1, "Day must be between 1 and 28")
    .max(28, "Day must be between 1 and 28"),
  onGenerate: z.enum(["draft", "send"]),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid end date")
    .optional()
    .or(z.literal("")),
  maxOccurrences: z
    .union([
      z.coerce
        .number()
        .int()
        .min(1, "Max invoices must be between 1 and 1200")
        .max(1200, "Max invoices must be between 1 and 1200"),
      z.literal(""),
      z.nan(),
    ])
    .optional(),
  enabled: z.enum(["true", "false"]).optional(),
  lines: z.array(recurringLineSchema).min(1, "Add at least one line item"),
});

export type RecurringInvoiceParsed = z.infer<typeof recurringInvoiceSchema>;

export function recurringInvoiceRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    notes: formData.get("notes") ?? "",
    dayOfMonth: formData.get("dayOfMonth") ?? "1",
    onGenerate: formData.get("onGenerate") ?? "draft",
    endsOn: formData.get("endsOn") ?? "",
    maxOccurrences: formData.get("maxOccurrences") ?? "",
    enabled: formData.get("enabled") ?? "true",
    lines: parseDocumentLinesJson(formData.get("linesJson")),
  };
}

export function parseRecurringInvoiceInput(raw: unknown) {
  return parseWithFieldErrors(recurringInvoiceSchema, raw);
}
