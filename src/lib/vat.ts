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

const UK_VAT_MESSAGE =
  "Enter a valid UK VAT number (e.g. GB434031494)";

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 1] as const;

/** Trim, uppercase, strip spaces/hyphens; prefix GB for bare 9/12 digits. */
export function normalizeUkVatNumber(input: string): string {
  let s = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (/^\d{9}$/.test(s) || /^\d{12}$/.test(s)) {
    s = `GB${s}`;
  }
  return s;
}

function ukVatChecksumOk(nineDigits: string): boolean {
  if (!/^\d{9}$/.test(nineDigits)) return false;
  let total = 0;
  for (let i = 0; i < 9; i++) {
    total += Number(nineDigits[i]) * WEIGHTS[i];
  }
  // HMRC: classic modulus-97, or (total − 55) for numbers issued from Nov 2009.
  return total % 97 === 0 || (total - 55) % 97 === 0;
}

/** Whether `normalized` is a valid UK VAT registration number. */
export function isValidUkVatNumber(normalized: string): boolean {
  if (/^GBGD\d{3}$/.test(normalized)) {
    const n = Number(normalized.slice(4));
    return n >= 0 && n <= 499;
  }
  if (/^GBHA\d{3}$/.test(normalized)) {
    const n = Number(normalized.slice(4));
    return n >= 500 && n <= 999;
  }
  if (/^GB\d{9}$/.test(normalized)) {
    return ukVatChecksumOk(normalized.slice(2));
  }
  if (/^GB\d{12}$/.test(normalized)) {
    return ukVatChecksumOk(normalized.slice(2, 11));
  }
  return false;
}

export function parseUkVatNumber(
  input: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter your VAT number when VAT registered" };
  }
  const normalized = normalizeUkVatNumber(trimmed);
  if (!isValidUkVatNumber(normalized)) {
    return { ok: false, message: UK_VAT_MESSAGE };
  }
  return { ok: true, value: normalized };
}
