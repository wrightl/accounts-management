import {
  eachMonth,
  financialYearStartDate,
  formatPeriodRangeLabel,
  resolvePeriod,
  todayIsoDate,
  type ResolvedSpendingPeriod,
} from "@/lib/dates";

/** Dashboard period chips — subset of spending presets plus trailing 12 months. */
export type DashboardPeriodKey =
  | "this-month"
  | "last-3-months"
  | "fy"
  | "trailing-12";

export const DASHBOARD_PERIOD_OPTIONS: Array<{
  value: DashboardPeriodKey;
  label: string;
}> = [
  { value: "this-month", label: "This month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "fy", label: "This FY" },
  { value: "trailing-12", label: "12 months" },
];

export function parseDashboardPeriod(
  raw: string | undefined | null,
): DashboardPeriodKey {
  if (
    raw === "this-month" ||
    raw === "last-3-months" ||
    raw === "fy" ||
    raw === "trailing-12"
  ) {
    return raw;
  }
  return "this-month";
}

function parseIso(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function startOfMonth(year: number, month: number): string {
  return formatIso(year, month, 1);
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

function resolveTrailing12(today: string): ResolvedSpendingPeriod {
  const { year, month } = parseIso(today);
  const start = shiftMonth(year, month, -11);
  const from = startOfMonth(start.year, start.month);
  const compareStart = shiftMonth(start.year, start.month, -12);
  const compareFrom = startOfMonth(compareStart.year, compareStart.month);
  const compareTo = addDays(compareFrom, diffDays(from, today));
  return {
    preset: "custom",
    from,
    to: today,
    compareFrom,
    compareTo,
    buckets: "month",
    label: "Last 12 months",
    compareLabel: "Prior 12 months",
  };
}

export function resolveDashboardPeriod(
  key: DashboardPeriodKey,
  fyEndMonth: number,
  today: string = todayIsoDate(),
): ResolvedSpendingPeriod {
  switch (key) {
    case "this-month":
      return resolvePeriod("current-month", fyEndMonth, { today });
    case "last-3-months":
      return resolvePeriod("last-3-months", fyEndMonth, { today });
    case "fy":
      return resolvePeriod("current-fy", fyEndMonth, { today });
    case "trailing-12":
      return resolveTrailing12(today);
  }
}

/** Month keys for the trailing chart window (always 12 months ending today). */
export function trailingChartMonths(
  monthCount = 12,
  today: string = todayIsoDate(),
): { from: string; to: string; months: string[] } {
  const { year, month } = parseIso(today);
  const start = shiftMonth(year, month, -(monthCount - 1));
  const from = startOfMonth(start.year, start.month);
  return { from, to: today, months: eachMonth(from, today) };
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDeltaPercent(
  current: number,
  previous: number,
): { percent: number | null; label: string; direction: "up" | "down" | "flat" } {
  if (previous === 0) {
    if (current === 0) {
      return { percent: 0, label: "No change", direction: "flat" };
    }
    return { percent: null, label: "New", direction: "up" };
  }
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (percent === 0) {
    return { percent: 0, label: "No change", direction: "flat" };
  }
  const direction = percent > 0 ? "up" : "down";
  const sign = percent > 0 ? "+" : "";
  return {
    percent,
    label: `${sign}${percent}%`,
    direction,
  };
}

export function periodCompareCaption(period: ResolvedSpendingPeriod): string {
  return `vs ${period.compareLabel.toLowerCase()}`;
}

export { formatPeriodRangeLabel, financialYearStartDate };
