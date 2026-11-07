/** Civil calendar for the books. The company is UK-based. */
export const APP_TIMEZONE = "Europe/London";

/**
 * Today's date as YYYY-MM-DD in Europe/London (not UTC).
 * After 23:00 BST, UTC “today” is already tomorrow — using London avoids
 * flipping overdue flags and FY windows a day early.
 */
export function todayIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

/** Derive FY start month (1–12) from the month the financial year ends. */
export function financialYearStartMonth(fyEndMonth: number): number {
  return (fyEndMonth % 12) + 1;
}

/** Derive FY end month (1–12) from the month the financial year starts. */
export function financialYearEndMonth(fyStartMonth: number): number {
  return fyStartMonth === 1 ? 12 : fyStartMonth - 1;
}

export type SpendingPeriodPreset =
  | "current-month"
  | "last-month"
  | "last-3-months"
  | "current-fy"
  | "last-fy";

export type PeriodPreset = SpendingPeriodPreset | "custom";

export const PERIOD_PRESET_OPTIONS = [
  { value: "current-month" as const, label: "This month" },
  { value: "last-month" as const, label: "Last month" },
  { value: "last-3-months" as const, label: "Last 3 months" },
  { value: "current-fy" as const, label: "This financial year" },
  { value: "last-fy" as const, label: "Last financial year" },
  { value: "custom" as const, label: "Custom" },
];

export interface ResolvedSpendingPeriod {
  preset: PeriodPreset;
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  buckets: "day" | "month";
  label: string;
  compareLabel: string;
}

function parseIso(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(iso: string, delta: number): string {
  const { year, month, day } = parseIso(iso);
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return formatIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function diffDays(from: string, to: string): number {
  const a = parseIso(from);
  const b = parseIso(to);
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function startOfMonth(year: number, month: number): string {
  return formatIso(year, month, 1);
}

function endOfMonth(year: number, month: number): string {
  return formatIso(year, month, daysInMonth(year, month));
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** First day of the financial year containing `today`. */
export function financialYearStartDate(fyEndMonth: number, today: string): string {
  const startMonth = financialYearStartMonth(fyEndMonth);
  const { year, month } = parseIso(today);
  const fyStartYear = month >= startMonth ? year : year - 1;
  return startOfMonth(fyStartYear, startMonth);
}

/** Last day of the financial year containing `today`. */
export function financialYearEndDate(fyEndMonth: number, today: string): string {
  const start = financialYearStartDate(fyEndMonth, today);
  const { year, month } = parseIso(start);
  const end = shiftMonth(year, month, 11);
  return endOfMonth(end.year, end.month);
}

/** Default accrual report window: current FY start → today. */
export function defaultReportPeriod(fyEndMonth = 3): { from: string; to: string } {
  const to = todayIsoDate();
  const from = financialYearStartDate(fyEndMonth, to);
  return { from, to };
}

export function isSpendingPeriodPreset(value: string): value is SpendingPeriodPreset {
  return (
    value === "current-month" ||
    value === "last-month" ||
    value === "last-3-months" ||
    value === "current-fy" ||
    value === "last-fy"
  );
}

export function isPeriodPreset(value: string): value is PeriodPreset {
  return isSpendingPeriodPreset(value) || value === "custom";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return null;
  const { year, month, day } = parseIso(trimmed);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return trimmed;
}

export function periodPresetLabel(preset: PeriodPreset): string {
  return PERIOD_PRESET_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}

/** Short UK label for a custom from–to range. */
export function formatPeriodRangeLabel(
  from: string,
  to: string,
  format: DateFormat = "d-mon-y",
): string {
  const fmt = (iso: string) => formatIsoDate(iso, format);
  if (from === to) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}

export function resolveSpendingPeriod(
  preset: SpendingPeriodPreset,
  fyEndMonth: number,
  today: string = todayIsoDate(),
): ResolvedSpendingPeriod {
  const { year, month, day } = parseIso(today);

  if (preset === "current-month") {
    const from = startOfMonth(year, month);
    const prev = shiftMonth(year, month, -1);
    const compareFrom = startOfMonth(prev.year, prev.month);
    const compareDay = Math.min(day, daysInMonth(prev.year, prev.month));
    const compareTo = formatIso(prev.year, prev.month, compareDay);
    return {
      preset,
      from,
      to: today,
      compareFrom,
      compareTo,
      buckets: "day",
      label: `${monthName(month)} ${year}`,
      compareLabel: `${monthName(prev.month)} ${prev.year}`,
    };
  }

  if (preset === "last-month") {
    const prev = shiftMonth(year, month, -1);
    const from = startOfMonth(prev.year, prev.month);
    const to = endOfMonth(prev.year, prev.month);
    const before = shiftMonth(prev.year, prev.month, -1);
    const compareFrom = startOfMonth(before.year, before.month);
    const compareTo = endOfMonth(before.year, before.month);
    return {
      preset,
      from,
      to,
      compareFrom,
      compareTo,
      buckets: "day",
      label: `${monthName(prev.month)} ${prev.year}`,
      compareLabel: `${monthName(before.month)} ${before.year}`,
    };
  }

  if (preset === "last-3-months") {
    const start = shiftMonth(year, month, -2);
    const from = startOfMonth(start.year, start.month);
    const compareStart = shiftMonth(start.year, start.month, -3);
    const compareFrom = startOfMonth(compareStart.year, compareStart.month);
    const compareTo = addDays(compareFrom, diffDays(from, today));
    return {
      preset,
      from,
      to: today,
      compareFrom,
      compareTo,
      buckets: "month",
      label: `${monthName(start.month)} – ${monthName(month)} ${year}`,
      compareLabel: "Prior 3 months",
    };
  }

  if (preset === "current-fy") {
    const from = financialYearStartDate(fyEndMonth, today);
    const prevFyStart = financialYearStartDate(fyEndMonth, addDays(from, -1));
    const offset = diffDays(from, today);
    const compareTo = addDays(prevFyStart, offset);
    const startMonth = financialYearStartMonth(fyEndMonth);
    const endMonth = fyEndMonth;
    return {
      preset,
      from,
      to: today,
      compareFrom: prevFyStart,
      compareTo,
      buckets: "month",
      label: `FY ${monthName(startMonth)} – ${monthName(endMonth)} ${parseIso(from).year}`,
      compareLabel: `Prior FY`,
    };
  }

  // last-fy: the full financial year before the current one
  if (preset !== "last-fy") {
    throw new Error(`Unknown spending period preset: ${preset satisfies never}`);
  }

  const currentFyStart = financialYearStartDate(fyEndMonth, today);
  const lastFyStartYear = parseIso(financialYearStartDate(fyEndMonth, addDays(currentFyStart, -1))).year;
  return { ...resolveFinancialYearPeriod(fyEndMonth, lastFyStartYear), preset };
}

/**
 * The whole financial year starting in `fyStartYear`, compared with the one
 * before it.
 */
export function resolveFinancialYearPeriod(
  fyEndMonth: number,
  fyStartYear: number,
): ResolvedSpendingPeriod {
  const startMonth = financialYearStartMonth(fyEndMonth);
  const from = startOfMonth(fyStartYear, startMonth);
  const end = shiftMonth(fyStartYear, startMonth, 11);
  const to = endOfMonth(end.year, end.month);
  return {
    preset: "custom",
    from,
    to,
    compareFrom: startOfMonth(fyStartYear - 1, startMonth),
    // The whole prior year, which can be a day longer when it holds 29 February.
    compareTo: addDays(from, -1),
    buckets: "month",
    label: `FY ${monthName(startMonth)} ${fyStartYear} – ${monthName(fyEndMonth)} ${end.year}`,
    compareLabel: `Prior FY`,
  };
}

function resolveCustomPeriod(
  fromRaw: string,
  toRaw: string,
  today: string = todayIsoDate(),
  dateFormat?: DateFormat,
): ResolvedSpendingPeriod {
  const { year, month } = parseIso(today);
  const defaultFrom = startOfMonth(year, month);
  let from = parseIsoDate(fromRaw) ?? defaultFrom;
  let to = parseIsoDate(toRaw) ?? today;
  if (from > to) {
    [from, to] = [to, from];
  }
  const span = diffDays(from, to);
  const compareTo = addDays(from, -1);
  const compareFrom = addDays(compareTo, -span);
  const buckets: "day" | "month" = span <= 62 ? "day" : "month";
  return {
    preset: "custom",
    from,
    to,
    compareFrom,
    compareTo,
    buckets,
    label: formatPeriodRangeLabel(from, to, dateFormat),
    compareLabel: "Prior period",
  };
}

export function resolvePeriod(
  preset: PeriodPreset,
  fyEndMonth: number,
  options?: { from?: string; to?: string; today?: string; dateFormat?: DateFormat },
): ResolvedSpendingPeriod {
  const today = options?.today ?? todayIsoDate();
  if (preset === "custom") {
    return resolveCustomPeriod(options?.from ?? "", options?.to ?? "", today, options?.dateFormat);
  }
  return resolveSpendingPeriod(preset, fyEndMonth, today);
}

/** Enumerate ISO dates from `from` through `to` inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Month keys (YYYY-MM) from `from` through `to` inclusive. */
export function eachMonth(from: string, to: string): string[] {
  const out: string[] = [];
  let { year, month } = parseIso(from);
  const end = parseIso(to);
  while (year < end.year || (year === end.year && month <= end.month)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    const next = shiftMonth(year, month, 1);
    year = next.year;
    month = next.month;
  }
  return out;
}

/** Ordinal suffix for a day of month, e.g. 1 → "1st", 23 → "23rd". */
export function ordinalDay(day: number): string {
  const mod100 = day % 100;
  const mod10 = day % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

export function ordinalDayFromIso(iso: string): string {
  return ordinalDay(Number(iso.slice(8, 10)));
}

/**
 * Group heading for a booked date: "Today", "Yesterday", then the date in
 * `format`, or a long UK date when no format is given.
 */
export function friendlyDayLabel(
  iso: string,
  today: string = todayIsoDate(),
  format?: DateFormat,
): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  if (format) return formatIsoDate(iso, format);
  const { year, month, day } = parseIso(iso);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Human-readable date for chart tooltips. */
export function formatChartTooltipDate(
  iso: string,
  buckets: "day" | "month",
  format: DateFormat = "d-mon-y",
): string {
  if (buckets === "month") {
    const [year, month] = iso.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return formatIsoDate(iso, format);
}

/** UK short date for PDFs and client-facing documents, e.g. 31/03/2026. */
export function formatIsoDateUk(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const { year, month, day } = parseIso(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Long UK date for documents and deadlines, e.g. 31 March 2026. */
export function formatIsoDateLong(iso: string): string {
  const { year, month, day } = parseIso(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Date formats a user can choose for the signed-in app. */
export const DATE_FORMATS = ["dmy", "d-mon-y", "iso", "mdy"] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export const DEFAULT_DATE_FORMAT: DateFormat = "dmy";

/**
 * A calendar date in the user's chosen format. Anything that is not a valid
 * ISO date is returned unchanged rather than shown as a wrong date.
 */
export function formatIsoDate(iso: string, format: DateFormat): string {
  if (!parseIsoDate(iso)) return iso;
  const { year, month, day } = parseIso(iso.trim());
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  switch (format) {
    case "dmy":
      return `${dd}/${mm}/${year}`;
    case "d-mon-y":
      return `${day} ${monthName(month).slice(0, 3)} ${year}`;
    case "iso":
      return `${year}-${mm}-${dd}`;
    case "mdy":
      return `${mm}/${dd}/${year}`;
  }
}

/** Calendar date of a timestamp in UK civil time, in the user's chosen format. */
export function formatInstantDate(
  value: Date | null | undefined,
  format: DateFormat,
): string {
  if (!value) return "—";
  return formatIsoDate(todayIsoDate(value), format);
}

/** Date and 24-hour time of a timestamp in UK civil time, in the user's chosen format. */
export function formatInstantDateTime(
  value: Date | null | undefined,
  format: DateFormat,
): string {
  if (!value) return "—";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    timeStyle: "medium",
  }).format(value);
  return `${formatInstantDate(value, format)}, ${time}`;
}

/** Whether an ISO calendar date falls on a Monday. */
export function isMonday(isoDate: string): boolean {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay() === 1;
}
