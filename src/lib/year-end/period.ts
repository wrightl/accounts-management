import {
  financialYearEndDate,
  financialYearStartDate,
  formatIsoDateLong,
  parseIsoDate,
} from "@/lib/dates";

/** The accounting period a pack covers. Both dates are inclusive. */
export type PackPeriod = { from: string; to: string };

/** When a business's accounting year ends. */
export type YearEndRule =
  | { kind: "fifth_april" }
  /** The last day of `month` (1 to 12). */
  | { kind: "month_end"; month: number };

type YearEndSettings = {
  entityType: "limited_company" | "sole_trader";
  financialYearEndMonth: number;
  yearEndOnFifthApril: boolean;
};

/**
 * A limited company's year ends on the last day of its year-end month. A sole
 * trader's is the tax year unless they chose a month end in Settings.
 */
export function yearEndRule(company: YearEndSettings): YearEndRule {
  if (company.entityType === "sole_trader" && company.yearEndOnFifthApril) {
    return { kind: "fifth_april" };
  }
  return { kind: "month_end", month: company.financialYearEndMonth };
}

/** The standard accounting year that `date` falls in. */
export function yearContaining(rule: YearEndRule, date: string): PackPeriod {
  if (rule.kind === "month_end") {
    return {
      from: financialYearStartDate(rule.month, date),
      to: financialYearEndDate(rule.month, date),
    };
  }
  const year = Number(date.slice(0, 4));
  const startYear = date >= `${year}-04-06` ? year : year - 1;
  return { from: `${pad(startYear)}-04-06`, to: `${pad(startYear + 1)}-04-05` };
}

function pad(year: number) {
  return String(year).padStart(4, "0");
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The most recent year that has ended before `today`. */
export function defaultYear(rule: YearEndRule, today: string): PackPeriod {
  return yearContaining(rule, dayBefore(yearContaining(rule, today).from));
}

const MAX_YEARS = 12;

/**
 * Years to offer, newest first: from the year holding the earliest record to
 * the one in progress, and always the most recent completed year.
 */
export function listYears(
  rule: YearEndRule,
  earliestRecordDate: string | null,
  today: string,
): PackPeriod[] {
  const current = yearContaining(rule, today);
  const lastCompleted = defaultYear(rule, today);
  const oldest =
    earliestRecordDate && earliestRecordDate < lastCompleted.from
      ? yearContaining(rule, earliestRecordDate)
      : lastCompleted;
  const years: PackPeriod[] = [];
  for (
    let year = current;
    year.from >= oldest.from && years.length < MAX_YEARS;
    year = yearContaining(rule, dayBefore(year.from))
  ) {
    years.push(year);
  }
  return years;
}

/** "1 April 2025 to 31 March 2026". */
export function periodLabel(period: PackPeriod): string {
  return `${formatIsoDateLong(period.from)} to ${formatIsoDateLong(period.to)}`;
}

/** Whether the period is exactly one of the business's standard years. */
export function isStandardYear(rule: YearEndRule, period: PackPeriod): boolean {
  const year = yearContaining(rule, period.from);
  return year.from === period.from && year.to === period.to;
}

export function isCompleted(period: PackPeriod, today: string): boolean {
  return period.to < today;
}

/** A period from two query values, or null unless both are real dates in order. */
export function parsePeriod(
  from: string | null | undefined,
  to: string | null | undefined,
): PackPeriod | null {
  const start = from ? parseIsoDate(from) : null;
  const end = to ? parseIsoDate(to) : null;
  if (!start || !end || start > end) return null;
  return { from: start, to: end };
}

export function inPeriod(date: string | null | undefined, period: PackPeriod): boolean {
  return date != null && date >= period.from && date <= period.to;
}
