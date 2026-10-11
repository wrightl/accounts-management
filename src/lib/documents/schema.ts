import { z } from "zod";

function hasAtMostDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Line quantity: positive, up to 3 dp (stored as numeric(12,3)). */
export const lineQuantitySchema = z.coerce
  .number({ error: "Enter a valid quantity" })
  .positive("Quantity must be greater than 0")
  .max(1_000_000, "Quantity is too large")
  .refine((v) => hasAtMostDecimals(v, 3), "Use at most 3 decimal places");

/** Line discount percentage: 0–100, up to 2 dp. Blank means no discount. */
export const lineDiscountPercentSchema = z.coerce
  .number({ error: "Enter a valid discount" })
  .min(0, "Discount can't be negative")
  .max(100, "Discount can't be more than 100%")
  .refine((v) => hasAtMostDecimals(v, 2), "Use at most 2 decimal places")
  .optional();

/** Shared line item shape for invoices, quotes, and orders. */
export const documentLineSchema = z.object({
  description: z.string().trim().min(1, "Enter a description"),
  quantity: lineQuantitySchema,
  unitPricePounds: z.string().trim().min(1, "Enter a unit price"),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
  discountPercent: lineDiscountPercentSchema,
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
