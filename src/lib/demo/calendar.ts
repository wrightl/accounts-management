import { financialYearEndDate, financialYearStartDate } from "@/lib/dates";
import { addDays, addMonths } from "@/lib/ledger/corporation-tax";

export { addDays, addMonths };

/** The demo company's financial year ends in March. */
export const DEMO_FY_END_MONTH = 3;
/** VAT quarters end in March, June, September and December. */
export const DEMO_VAT_QUARTER_END_MONTH = 3;

/**
 * First day of the demo records: the start of the financial year that began
 * at least three years before `today`, so there are always three full years.
 */
export function demoRecordsStart(today: string): string {
  return financialYearStartDate(DEMO_FY_END_MONTH, addMonths(today, -36));
}

export function fyStart(date: string): string {
  return financialYearStartDate(DEMO_FY_END_MONTH, date);
}

export function fyEnd(date: string): string {
  return financialYearEndDate(DEMO_FY_END_MONTH, date);
}

/** First day of each month from `from`'s month to `to`'s month. */
export function monthStarts(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = `${from.slice(0, 7)}-01`; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function lastDayOfMonth(monthStart: string): string {
  return addDays(addMonths(`${monthStart.slice(0, 7)}-01`, 1), -1);
}

/** Day `day` of the month, clamped to the month's length. */
export function dayOfMonth(monthStart: string, day: number): string {
  const last = lastDayOfMonth(monthStart);
  const d = Math.min(day, Number(last.slice(8, 10)));
  return `${monthStart.slice(0, 7)}-${String(d).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** The date, or the next Monday if it falls at a weekend. */
export function nextWorkday(date: string): string {
  const w = weekday(date);
  if (w === 6) return addDays(date, 2);
  if (w === 0) return addDays(date, 1);
  return date;
}

/** The date, or the Friday before if it falls at a weekend. */
export function previousWorkday(date: string): string {
  const w = weekday(date);
  if (w === 6) return addDays(date, -1);
  if (w === 0) return addDays(date, -2);
  return date;
}

/** Last working day of the month. */
export function lastWorkdayOfMonth(monthStart: string): string {
  return previousWorkday(lastDayOfMonth(monthStart));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A timestamp on `date` at `hour`:`minute` UTC. */
export function at(date: string, hour = 10, minute = 0): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
}

export function monthLabel(monthStart: string): string {
  return new Date(`${monthStart.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}
