/**
 * UK corporation tax estimate on a company's profit for an accounting period.
 *
 * From 1 April 2023: 19% small profits rate up to £50,000, 25% main rate from
 * £250,000, and marginal relief in between (standard fraction 3/200). Both
 * limits are divided by one plus the number of associated companies and
 * scaled by the length of the period. Before 1 April 2023 the rate was 19%.
 *
 * A period that straddles 1 April is split by days, as HMRC does, with each
 * part taxed under its own financial year's rules.
 */

const DAY_MS = 86_400_000;

export const SMALL_PROFITS_RATE = 0.19;
export const MAIN_RATE = 0.25;
export const LOWER_LIMIT_PENCE = 5_000_000;
export const UPPER_LIMIT_PENCE = 25_000_000;
export const MARGINAL_RELIEF_FRACTION = 3 / 200;
/** First day of the financial year that introduced the main rate. */
const MAIN_RATE_FROM = "2023-04-01";

/** s455 tax on director's loans still overdrawn 9 months after the year end. */
export const S455_RATE = 0.3375;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both inclusive. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

/** Same day `months` later, clamped to the month's last day. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const idx = y! * 12 + (m! - 1) + months;
  const year = Math.floor(idx / 12);
  const month = idx % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(year, month, Math.min(d!, lastDay)));
}

/** Split a period at each 1 April (the start of a corporation tax financial year). */
export function splitByTaxYear(from: string, to: string): Array<{ from: string; to: string }> {
  const parts: Array<{ from: string; to: string }> = [];
  let start = from;
  while (start <= to) {
    const year = Number(start.slice(0, 4));
    const nextApril = start.slice(5) < "04-01" ? `${year}-04-01` : `${year + 1}-04-01`;
    const end = addDays(nextApril, -1) < to ? addDays(nextApril, -1) : to;
    parts.push({ from: start, to: end });
    start = addDays(end, 1);
  }
  return parts;
}

export type CorporationTaxEstimate = {
  taxPence: number;
  /** Tax as a share of profit, 0 when there is no profit. */
  effectiveRate: number;
  /** Which band the profit falls in (for the main-rate years). */
  band: "none" | "small" | "marginal" | "main";
};

/**
 * Estimate corporation tax on `taxableProfitPence` for an accounting period.
 * `profitPence` is spread across the period by days; pass the full period
 * dates even when the profit is only to date, so the limits are a full year's.
 */
export function estimateCorporationTax(params: {
  taxableProfitPence: number;
  periodStart: string;
  periodEnd: string;
  associatedCompanies?: number;
}): CorporationTaxEstimate {
  const profit = params.taxableProfitPence;
  if (profit <= 0) return { taxPence: 0, effectiveRate: 0, band: "none" };

  const divisor = 1 + Math.max(0, params.associatedCompanies ?? 0);
  const totalDays = daysInclusive(params.periodStart, params.periodEnd);
  const parts = splitByTaxYear(params.periodStart, params.periodEnd);

  let tax = 0;
  let allocated = 0;
  let band: CorporationTaxEstimate["band"] = "small";
  parts.forEach((part, i) => {
    const days = daysInclusive(part.from, part.to);
    const partProfit =
      i === parts.length - 1 ? profit - allocated : Math.round((profit * days) / totalDays);
    allocated += partProfit;

    if (part.from < MAIN_RATE_FROM) {
      tax += partProfit * SMALL_PROFITS_RATE;
      return;
    }
    // Limits scale with this part's share of the period, as a fraction of a year.
    const lower = (LOWER_LIMIT_PENCE * days) / 365 / divisor;
    const upper = (UPPER_LIMIT_PENCE * days) / 365 / divisor;
    // Bands are tested on the whole period's profit apportioned to this part.
    if (partProfit <= lower) {
      tax += partProfit * SMALL_PROFITS_RATE;
    } else if (partProfit >= upper) {
      tax += partProfit * MAIN_RATE;
      band = "main";
    } else {
      tax += partProfit * MAIN_RATE - MARGINAL_RELIEF_FRACTION * (upper - partProfit);
      if (band !== "main") band = "marginal";
    }
  });

  const taxPence = Math.round(tax);
  return { taxPence, effectiveRate: taxPence / profit, band };
}
