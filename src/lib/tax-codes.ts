/**
 * VAT tax codes (roadmap item 17).
 *
 * A tax code says what kind of supply a line is; `vatRate` stays as the
 * percentage applied to it. Zero-rated, exempt and outside-scope lines all
 * carry a 0% rate, but VAT return Boxes 6 and 7 and e-invoice tax categories
 * need to tell them apart, so the code is stored alongside the rate.
 *
 * Each code maps directly to an EN 16931 VAT category (UNCL5305), so
 * e-invoicing (item 21) can use it without a second migration.
 *
 * Reverse charge and postponed import VAT carry a 0% rate on the line: the
 * VAT the business accounts for itself is worked out on the VAT return, not
 * charged by the supplier.
 */

export const TAX_CODES = [
  "standard",
  "reduced",
  "zero_rated",
  "exempt",
  "outside_scope",
  "reverse_charge",
  "export",
  "eu_supply",
  "postponed_import",
] as const;

export type TaxCode = (typeof TAX_CODES)[number];

/** EN 16931 VAT category codes used by the tax codes above. */
export type En16931Category = "S" | "AA" | "Z" | "E" | "O" | "AE" | "G" | "K";

/** Which side of the books a line is on. */
export type TaxCodeUse = "sales" | "purchases";

export const STANDARD_RATE = 20;
export const REDUCED_RATE = 5;

export interface TaxCodeInfo {
  code: TaxCode;
  /** Short name for pickers and PDFs. */
  label: string;
  /** One line explaining when to use it. */
  hint: string;
  /** EN 16931 category; null when there is no sales-side equivalent. */
  en16931: En16931Category | null;
  /** True when the line carries a rate above 0. */
  rated: boolean;
  /** Rate used when none is given. 0 for every unrated code. */
  defaultRate: number;
  /** Where the code can be used. */
  uses: readonly TaxCodeUse[];
}

const BOTH: readonly TaxCodeUse[] = ["sales", "purchases"];

export const TAX_CODE_INFO: Record<TaxCode, TaxCodeInfo> = {
  standard: {
    code: "standard",
    label: "Standard rate",
    hint: "Most goods and services, currently 20%.",
    en16931: "S",
    rated: true,
    defaultRate: STANDARD_RATE,
    uses: BOTH,
  },
  reduced: {
    code: "reduced",
    label: "Reduced rate",
    hint: "Goods and services at the reduced rate, currently 5%.",
    en16931: "AA",
    rated: true,
    defaultRate: REDUCED_RATE,
    uses: BOTH,
  },
  zero_rated: {
    code: "zero_rated",
    label: "Zero rated",
    hint: "Taxable at 0%, such as books, most food and passenger transport.",
    en16931: "Z",
    rated: false,
    defaultRate: 0,
    uses: BOTH,
  },
  exempt: {
    code: "exempt",
    label: "Exempt",
    hint: "No VAT by law, such as insurance, some training and financial services.",
    en16931: "E",
    rated: false,
    defaultRate: 0,
    uses: BOTH,
  },
  outside_scope: {
    code: "outside_scope",
    label: "Outside the scope of VAT",
    hint: "Not a supply for VAT, such as wages, dividends, or services to overseas businesses.",
    en16931: "O",
    rated: false,
    defaultRate: 0,
    uses: BOTH,
  },
  reverse_charge: {
    code: "reverse_charge",
    label: "Reverse charge",
    hint: "The customer accounts for the VAT, such as construction services or services bought from abroad.",
    en16931: "AE",
    rated: false,
    defaultRate: 0,
    uses: BOTH,
  },
  export: {
    code: "export",
    label: "Export of goods",
    hint: "Goods sent outside the UK, zero rated as an export.",
    en16931: "G",
    rated: false,
    defaultRate: 0,
    uses: ["sales"],
  },
  eu_supply: {
    code: "eu_supply",
    label: "Goods to the EU from Northern Ireland",
    hint: "Goods sent from Northern Ireland to a VAT-registered EU business.",
    en16931: "K",
    rated: false,
    defaultRate: 0,
    uses: ["sales"],
  },
  postponed_import: {
    code: "postponed_import",
    label: "Postponed import VAT",
    hint: "Import VAT accounted for on the VAT return rather than paid at the border.",
    en16931: null,
    rated: false,
    defaultRate: 0,
    uses: ["purchases"],
  },
};

export function isTaxCode(value: unknown): value is TaxCode {
  return typeof value === "string" && (TAX_CODES as readonly string[]).includes(value);
}

/** Parse a form or API value; anything unknown gives null. */
export function parseTaxCode(input: unknown): TaxCode | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toLowerCase();
  return isTaxCode(code) ? code : null;
}

export function taxCodeInfo(code: TaxCode): TaxCodeInfo {
  return TAX_CODE_INFO[code];
}

/** Codes that can be chosen for sales or for purchases, in display order. */
export function taxCodesFor(use: TaxCodeUse): TaxCode[] {
  return TAX_CODES.filter((code) => TAX_CODE_INFO[code].uses.includes(use));
}

export function isTaxCodeAllowed(code: TaxCode, use: TaxCodeUse): boolean {
  return TAX_CODE_INFO[code].uses.includes(use);
}

export function isRatedTaxCode(code: TaxCode): boolean {
  return TAX_CODE_INFO[code].rated;
}

export function en16931Category(code: TaxCode): En16931Category | null {
  return TAX_CODE_INFO[code].en16931;
}

/** Keeps a rate between 0 and 100 without rounding it; not a number gives 0. */
function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.min(100, Math.max(0, rate));
}

/** Whether `rate` is `target` exactly, allowing only for floating-point noise. */
function isRate(rate: number, target: number): boolean {
  return Math.abs(rate - target) < 0.005;
}

/**
 * The rate to store for a new line with `code`: the code's own rate, so the
 * code, its EN 16931 category and the rate always agree. Lines already stored
 * keep the rate they were saved with if the law changes it later.
 */
export function rateForTaxCode(code: TaxCode): number {
  return TAX_CODE_INFO[code].defaultRate;
}

/** A label with the rate for rated codes, e.g. "Standard rate 20%". */
export function taxCodeDisplay(code: TaxCode): string {
  const info = TAX_CODE_INFO[code];
  if (!info.rated) return info.label;
  return `${info.label} ${info.defaultRate}%`;
}

/** A tax code worked out from older data, and whether a person should check it. */
export interface InferredTaxCode {
  code: TaxCode;
  needsReview: boolean;
}

/**
 * The tax code for a line that only has a rate, as stored before tax codes.
 * Used by the backfill and by callers that still post a bare rate.
 *
 *  - Not VAT registered: outside the scope of VAT, whatever the rate.
 *  - 20% is standard and 5% is reduced.
 *  - Any other rate above 0, including near misses like 19.6%, is treated as
 *    standard and flagged. Rates are matched exactly, never rounded.
 *  - 0% is zero rated.
 */
export function inferTaxCodeFromRate(
  rate: number | null | undefined,
  company: { vatRegistered?: boolean | null },
): InferredTaxCode {
  if (!company.vatRegistered) return { code: "outside_scope", needsReview: false };
  const r = clampRate(rate ?? 0);
  if (isRate(r, STANDARD_RATE)) return { code: "standard", needsReview: false };
  if (isRate(r, REDUCED_RATE)) return { code: "reduced", needsReview: false };
  if (!isRate(r, 0)) return { code: "standard", needsReview: true };
  return { code: "zero_rated", needsReview: false };
}

/**
 * The tax code for an expense that only has a rate. Like
 * {@link inferTaxCodeFromRate}, but a 0% expense for a VAT-registered company
 * could be zero rated, exempt, outside scope or reverse charge, so it is
 * guessed from the category and currency and flagged unless the guess is
 * reliable.
 *
 *  - Travel: zero rated (fares), not flagged.
 *  - Training: exempt, flagged.
 *  - Software paid in a foreign currency: reverse charge, flagged.
 *  - Anything else: zero rated, flagged.
 */
export function inferExpenseTaxCode(
  expense: {
    vatRate: number | null | undefined;
    category?: string | null;
    currency?: string | null;
  },
  company: { vatRegistered?: boolean | null },
): InferredTaxCode {
  const fromRate = inferTaxCodeFromRate(expense.vatRate, company);
  if (fromRate.code !== "zero_rated") return fromRate;

  const category = expense.category?.trim().toLowerCase() ?? "";
  const currency = expense.currency?.trim().toUpperCase() || "GBP";
  if (category === "travel") return { code: "zero_rated", needsReview: false };
  if (category === "training") return { code: "exempt", needsReview: true };
  if (category === "software" && currency !== "GBP") {
    return { code: "reverse_charge", needsReview: true };
  }
  return { code: "zero_rated", needsReview: true };
}

/** The tax code and rate to store on a line. */
export interface LineTax {
  taxCode: TaxCode;
  vatRate: number;
}

/**
 * Default tax for a new line: the company's default code when registered,
 * else outside the scope of VAT at 0%. The rate always comes from the code;
 * an old default rate that is not a UK rate gives the standard rate.
 */
export function defaultLineTax(company: {
  vatRegistered?: boolean | null;
  defaultTaxCode?: string | null;
  defaultVatRate?: number | null;
}): LineTax {
  if (!company.vatRegistered) return { taxCode: "outside_scope", vatRate: 0 };
  const code =
    parseTaxCode(company.defaultTaxCode) ??
    inferTaxCodeFromRate(company.defaultVatRate ?? STANDARD_RATE, company).code;
  return { taxCode: code, vatRate: rateForTaxCode(code) };
}

export class TaxCodeNotAllowedError extends Error {
  constructor(
    readonly code: TaxCode,
    readonly use: TaxCodeUse,
  ) {
    super(`${TAX_CODE_INFO[code].label} cannot be used on ${use}`);
    this.name = "TaxCodeNotAllowedError";
  }
}

export class TaxRateNotRecognisedError extends Error {
  constructor(readonly rate: number) {
    super(
      `${rate}% is not a UK VAT rate. Choose a tax code: standard (${STANDARD_RATE}%), reduced (${REDUCED_RATE}%) or a 0% code.`,
    );
    this.name = "TaxRateNotRecognisedError";
  }
}

/**
 * The tax code and rate to store for a posted line.
 *
 *  - Not VAT registered: outside the scope of VAT at 0%, whatever was posted.
 *  - A valid code: kept, with the code's own rate. Any posted rate is ignored.
 *  - No code (callers that still post only a rate): inferred from the rate.
 *
 * Throws {@link TaxCodeNotAllowedError} when a registered company posts a
 * code that doesn't apply, such as postponed import VAT on a sale, and
 * {@link TaxRateNotRecognisedError} when a bare rate is not 0%, 5% or 20%.
 */
export function resolveLineTax(
  company: { vatRegistered?: boolean | null },
  posted: { taxCode?: unknown; vatRate?: number | null },
  use: TaxCodeUse,
): LineTax {
  if (!company.vatRegistered) return { taxCode: "outside_scope", vatRate: 0 };
  const code = parseTaxCode(posted.taxCode);
  if (code) {
    if (!isTaxCodeAllowed(code, use)) throw new TaxCodeNotAllowedError(code, use);
    return { taxCode: code, vatRate: rateForTaxCode(code) };
  }
  const inferred = inferTaxCodeFromRate(posted.vatRate, company);
  if (inferred.needsReview) throw new TaxRateNotRecognisedError(posted.vatRate ?? 0);
  return { taxCode: inferred.code, vatRate: rateForTaxCode(inferred.code) };
}
