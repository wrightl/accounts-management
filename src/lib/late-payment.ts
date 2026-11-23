/**
 * Statutory late payment charges under the Late Payment of Commercial Debts
 * (Interest) Act 1998, for business-to-business invoices.
 *
 * Interest is simple, at 8% over the Bank of England base rate in force on
 * the reference date (30 June or 31 December) before the debt became overdue,
 * charged daily from the day after the due date. Fixed compensation is £40,
 * £70 or £100 depending on the size of the debt.
 */

import { toSterlingPence } from "@/lib/currency";

export const STATUTORY_MARGIN_PERCENT = 8;

/**
 * Base rate on each reference date, by the half-year it applies to. Add a row
 * after each 30 June and 31 December. Later debts use the last row until then.
 */
export const REFERENCE_RATES: ReadonlyArray<{ appliesFrom: string; basePercent: number }> = [
  { appliesFrom: "2023-01-01", basePercent: 3.5 }, // 31 Dec 2022
  { appliesFrom: "2023-07-01", basePercent: 5.0 }, // 30 Jun 2023
  { appliesFrom: "2024-01-01", basePercent: 5.25 }, // 31 Dec 2023
  { appliesFrom: "2024-07-01", basePercent: 5.25 }, // 30 Jun 2024
  { appliesFrom: "2025-01-01", basePercent: 4.75 }, // 31 Dec 2024
  { appliesFrom: "2025-07-01", basePercent: 4.25 }, // 30 Jun 2025
  { appliesFrom: "2026-01-01", basePercent: 3.75 }, // 31 Dec 2025
  { appliesFrom: "2026-07-01", basePercent: 3.75 }, // 30 Jun 2026
];

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** False for debts older than the rate table, where no charge can be worked out. */
export function hasReferenceRate(dueDate: string): boolean {
  const overdueFrom = new Date(toUtc(dueDate) + DAY_MS).toISOString().slice(0, 10);
  return overdueFrom >= REFERENCE_RATES[0]!.appliesFrom;
}

/** Base rate for a debt that became overdue on the day after `dueDate`. */
export function referenceBaseRate(dueDate: string): { basePercent: number; known: boolean } {
  const overdueFrom = new Date(toUtc(dueDate) + DAY_MS).toISOString().slice(0, 10);
  let match = REFERENCE_RATES[0]!;
  for (const row of REFERENCE_RATES) {
    if (row.appliesFrom <= overdueFrom) match = row;
  }
  const last = REFERENCE_RATES[REFERENCE_RATES.length - 1]!;
  // Known while the debt falls within the half-year of the last row.
  const known = match !== last || daysBetween(last.appliesFrom, overdueFrom) < 184;
  return { basePercent: match.basePercent, known };
}

/** Fixed sum for recovery costs, by the size of the debt. */
export function fixedCompensationPence(debtPence: number): number {
  if (debtPence < 100_000) return 4_000;
  if (debtPence < 1_000_000) return 7_000;
  return 10_000;
}

export type LatePaymentCharge = {
  daysLate: number;
  /** Statutory rate a year, e.g. 11.75. */
  ratePercent: number;
  basePercent: number;
  /** False when the reference rate isn't in the table yet. */
  rateKnown: boolean;
  /** Amounts in the invoice's currency (minor units). */
  interest: number;
  dailyInterest: number;
  compensation: number;
  total: number;
  /** The fixed compensation in sterling, as the Act sets it. */
  compensationPence: number;
};

/**
 * Charges claimable on `amountDue`, in the invoice's currency, that was due on
 * `dueDate`, as at `asOf`. Interest runs on the debt in its own currency. The
 * fixed compensation is set in sterling by the size of the debt, so for a
 * foreign invoice the debt is valued, and the compensation converted, at
 * `fxRate` (units of the currency per £1 on `asOf`; 1 for sterling).
 */
export function latePaymentCharge(params: {
  amountDue: number;
  dueDate: string;
  asOf: string;
  fxRate?: number;
}): LatePaymentCharge | null {
  const daysLate = daysBetween(params.dueDate, params.asOf);
  if (daysLate <= 0 || params.amountDue <= 0) return null;
  if (!hasReferenceRate(params.dueDate)) return null;
  const fxRate = params.fxRate ?? 1;
  const { basePercent, known } = referenceBaseRate(params.dueDate);
  const ratePercent = basePercent + STATUTORY_MARGIN_PERCENT;
  const daily = (params.amountDue * ratePercent) / 100 / 365;
  const interest = Math.round(daily * daysLate);
  const compensationPence = fixedCompensationPence(toSterlingPence(params.amountDue, fxRate));
  const compensation = fxRate === 1 ? compensationPence : Math.round(compensationPence * fxRate);
  return {
    daysLate,
    ratePercent,
    basePercent,
    rateKnown: known,
    interest,
    dailyInterest: Math.round(daily),
    compensation,
    total: interest + compensation,
    compensationPence,
  };
}
