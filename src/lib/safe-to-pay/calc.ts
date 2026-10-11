import { addDays, addMonths } from "@/lib/ledger/corporation-tax";

/** Days ahead that "expected in" looks at. */
export const LOOKAHEAD_DAYS = 30;

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * The VAT quarter containing `date`. `firstQuarterEndMonth` is 1, 2 or 3: the
 * month the first quarter of the calendar year ends in.
 */
export function vatQuarterFor(
  date: string,
  firstQuarterEndMonth: number,
): { start: string; end: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  // Quarter end months: e.g. 3 → 3, 6, 9, 12.
  let endMonth = firstQuarterEndMonth;
  while (endMonth < month) endMonth += 3;
  const endYear = year + Math.floor((endMonth - 1) / 12);
  const endM = ((endMonth - 1) % 12) + 1;
  const end = lastDayOfMonth(endYear, endM);
  const start = addMonths(`${end.slice(0, 8)}01`, -2);
  return { start, end };
}

/** VAT return and payment deadline: one month and seven days after the quarter. */
export function vatDueDate(quarterEnd: string): string {
  const monthLater = addMonths(`${quarterEnd.slice(0, 8)}01`, 1);
  const endOfNextMonth = lastDayOfMonth(
    Number(monthLater.slice(0, 4)),
    Number(monthLater.slice(5, 7)),
  );
  return addDays(endOfNextMonth, 7);
}

export type SafeToPayInputs = {
  cashPence: number;
  vatOwedPence: number;
  corporationTaxPence: number;
  billsDuePence: number;
  bufferPence: number;
  /** Estimated distributable reserves after dividends already declared. */
  reservesPence: number;
  expectedInPence: number;
};

export type SafeToPay = SafeToPayInputs & {
  /** Cash left once everything owed and the buffer are set aside. */
  freeCashPence: number;
  safeNowPence: number;
  limitedBy: "cash" | "reserves";
  safeLaterPence: number;
  laterLimitedBy: "cash" | "reserves";
};

/**
 * Cash at bank less VAT owed, corporation tax, bills due and a buffer,
 * capped at distributable reserves. "Later" adds the money expected in over
 * the next 30 days, still capped at reserves.
 */
export function computeSafeToPay(inputs: SafeToPayInputs): SafeToPay {
  const freeCashPence =
    inputs.cashPence -
    inputs.vatOwedPence -
    inputs.corporationTaxPence -
    inputs.billsDuePence -
    inputs.bufferPence;
  const reserves = Math.max(0, inputs.reservesPence);
  const now = Math.max(0, freeCashPence);
  const later = Math.max(0, freeCashPence + inputs.expectedInPence);
  return {
    ...inputs,
    freeCashPence,
    safeNowPence: Math.min(now, reserves),
    limitedBy: now <= reserves ? "cash" : "reserves",
    safeLaterPence: Math.min(later, reserves),
    laterLimitedBy: later <= reserves ? "cash" : "reserves",
  };
}
