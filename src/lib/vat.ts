/**
 * VAT helpers for UK readiness (export / reports — not HMRC MTD submit).
 *
 * Document lines (invoice/quote/order): unit prices are **net** (ex-VAT);
 * use {@link invoiceTotals} from money.ts.
 *
 * Expenses: `amountPence` is **gross** (cash / bank-matched); derive VAT with
 * {@link vatFromInclusiveGross}.
 */

export const STANDARD_VAT_RATE = 20;

export type VatRateChoice = 0 | 20 | "custom";

/** Clamp a percentage rate to 0–100 integers. */
export function clampVatRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.min(100, Math.max(0, Math.round(rate)));
}

/** Parse a form/API rate; invalid → 0. */
export function parseVatRate(input: unknown): number {
  if (input == null || input === "") return 0;
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isFinite(n)) return 0;
  return clampVatRate(n);
}

/** Whether the company should charge / record VAT on documents. */
export function companyChargesVat(company: {
  vatRegistered?: boolean | null;
}): boolean {
  return Boolean(company.vatRegistered);
}

/**
 * Effective default rate for new lines: company default when registered, else 0.
 */
export function defaultLineVatRate(company: {
  vatRegistered?: boolean | null;
  defaultVatRate?: number | null;
}): number {
  if (!companyChargesVat(company)) return 0;
  return clampVatRate(company.defaultVatRate ?? STANDARD_VAT_RATE);
}

/**
 * Force rate to 0 when the company is not VAT registered.
 */
export function resolveLineVatRate(
  company: { vatRegistered?: boolean | null },
  postedRate: number | null | undefined,
): number {
  if (!companyChargesVat(company)) return 0;
  return clampVatRate(postedRate ?? 0);
}

/** VAT portion of an inclusive (gross) amount at `rate`%. */
export function vatFromInclusiveGross(grossPence: number, rate: number): number {
  const r = clampVatRate(rate);
  if (r <= 0 || grossPence === 0) return 0;
  return Math.round((grossPence * r) / (100 + r));
}

/** Net (ex-VAT) portion of an inclusive (gross) amount at `rate`%. */
export function netFromInclusiveGross(grossPence: number, rate: number): number {
  return grossPence - vatFromInclusiveGross(grossPence, rate);
}

/**
 * Back out net unit price from a gross lump at a single rate
 * (milestone / part invoices).
 */
export function netPenceFromGrossAtRate(grossPence: number, rate: number): number {
  return netFromInclusiveGross(grossPence, rate);
}
