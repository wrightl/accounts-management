import { z } from "zod";

/** Shared line item shape for invoices, quotes, and orders. */
export const documentLineSchema = z.object({
  description: z.string().trim().min(1, "Enter a description"),
  quantity: z.coerce
    .number({ error: "Enter a valid quantity" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
  unitPricePounds: z.string().trim().min(1, "Enter a unit price"),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
});

export type DocumentLineParsed = z.infer<typeof documentLineSchema>;

export const documentLinesSchema = z
  .array(documentLineSchema)
  .min(1, "Add at least one line item");

/** Parse `linesJson` FormData value into an array (no blank-line filtering). */
export function parseDocumentLinesJson(raw: FormDataEntryValue | null): unknown[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
