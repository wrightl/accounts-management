import { z } from "zod";
import {
  REDUCED_RATE,
  STANDARD_RATE,
  TAX_CODES,
  isTaxCodeAllowed,
  resolveLineTax,
  type LineTax,
  type TaxCodeUse,
} from "@/lib/tax-codes";

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

/** A posted tax code; blank means none was chosen. */
export function lineTaxCodeSchema(use: TaxCodeUse) {
  return z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z
      .enum(TAX_CODES, { error: "Choose a tax code" })
      .refine(
        (code) => isTaxCodeAllowed(code, use),
        use === "sales" ? "That tax code can't be used on a sale" : "That tax code can't be used on a purchase",
      )
      .optional(),
  );
}

/**
 * A posted VAT rate. Only UK rates are accepted: anything else needs a tax
 * code, and the rate then comes from the code.
 */
export const lineVatRateSchema = z.coerce
  .number()
  .int()
  .refine((r) => r === 0 || r === REDUCED_RATE || r === STANDARD_RATE, "Choose a tax code")
  .optional();

/** Shared line item shape for invoices, quotes, and orders. */
export const documentLineSchema = z.object({
  description: z.string().trim().min(1, "Enter a description"),
  quantity: lineQuantitySchema,
  unitPricePounds: z.string().trim().min(1, "Enter a unit price"),
  taxCode: lineTaxCodeSchema("sales"),
  vatRate: lineVatRateSchema,
  discountPercent: lineDiscountPercentSchema,
});

/**
 * The tax code and rate to store for a validated line. A line with neither a
 * code nor a rate is 0%, as before tax codes. Whatever the line posted, a
 * company that isn't VAT registered stores outside scope at 0%.
 */
export function storedLineTax(
  company: { vatRegistered?: boolean | null },
  line: { taxCode?: string | null; vatRate?: number | null },
  use: TaxCodeUse = "sales",
): LineTax & { taxCodeNeedsReview: false } {
  const tax = resolveLineTax(company, { taxCode: line.taxCode, vatRate: line.vatRate ?? 0 }, use);
  return { ...tax, taxCodeNeedsReview: false };
}

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
