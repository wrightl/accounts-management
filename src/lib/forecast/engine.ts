/**
 * 13-week cash-flow forecast. Pure, so the page can recompute what-ifs in
 * the browser without a round trip.
 */

export const FORECAST_WEEKS = 13;

export type ForecastEventKind =
  | "invoice"
  | "milestone"
  | "recurring"
  | "vat"
  | "corporation_tax"
  | "dividend"
  | "reimbursements"
  | "hire";

export type ForecastEvent = {
  date: string;
  /** Positive money in, negative money out. */
  amountPence: number;
  kind: ForecastEventKind;
  label: string;
  clientId?: string | null;
  /** An invoice already past its due date. */
  overdue?: boolean;
};

export type WhatIf = {
  /** Leave out invoices already overdue, in case they don't pay. */
  excludeOverdue?: boolean;
  /** Push one client's payments back by `lateWeeks`. */
  lateClientId?: string | null;
  lateWeeks?: number;
  /** A new hire: fully loaded monthly cost from a start date. */
  hireMonthlyCostPence?: number;
  hireStartDate?: string | null;
  /** Override the regular weekly spending. */
  weeklySpendPence?: number | null;
};

export type ForecastWeek = {
  index: number;
  start: string;
  end: string;
  inPence: number;
  /** Money out, as a positive number, including regular spending. */
  outPence: number;
  spendPence: number;
  closingPence: number;
  events: ForecastEvent[];
};

export type Forecast = {
  openingCashPence: number;
  weeklySpendPence: number;
  lowCashPence: number;
  weeks: ForecastWeek[];
  lowest: ForecastWeek;
  /** First week the balance ends below the low-cash line. */
  firstBelowLow: ForecastWeek | null;
  firstNegative: ForecastWeek | null;
};

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

export function shiftDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const day = new Date(toUtc(iso)).getUTCDay(); // 0 = Sunday
  return shiftDays(iso, day === 0 ? -6 : 1 - day);
}

/** Weekly cost of a monthly amount (12 months over 52 weeks). */
export function monthlyToWeekly(pence: number): number {
  return Math.round((pence * 12) / 52);
}

export function applyWhatIfs(
  events: ForecastEvent[],
  whatIf: WhatIf,
  firstWeekStart: string,
  weeks: number = FORECAST_WEEKS,
): ForecastEvent[] {
  let out = events.filter((e) => !(whatIf.excludeOverdue && e.overdue));
  if (whatIf.lateClientId && whatIf.lateWeeks) {
    out = out.map((e) =>
      e.clientId === whatIf.lateClientId && e.amountPence > 0
        ? {
            ...e,
            // Overdue money counts from this week, then moves back.
            date: shiftDays(e.date < firstWeekStart ? firstWeekStart : e.date, whatIf.lateWeeks! * 7),
          }
        : e,
    );
  }
  if (whatIf.hireMonthlyCostPence && whatIf.hireStartDate) {
    const weekly = monthlyToWeekly(whatIf.hireMonthlyCostPence);
    for (let i = 0; i < weeks; i++) {
      const start = shiftDays(firstWeekStart, i * 7);
      if (shiftDays(start, 6) < whatIf.hireStartDate) continue;
      out = [...out, { date: start, amountPence: -weekly, kind: "hire", label: "New hire" }];
    }
  }
  return out;
}

/**
 * Roll cash forward week by week from `openingCashPence`. Events dated
 * before the first week (overdue invoices, bills already owed) land in it;
 * events after the last week are left out.
 */
export function buildForecast(params: {
  openingCashPence: number;
  firstWeekStart: string;
  events: ForecastEvent[];
  weeklySpendPence: number;
  lowCashPence: number;
  weeks?: number;
}): Forecast {
  const count = params.weeks ?? FORECAST_WEEKS;
  let balance = params.openingCashPence;
  const weeks: ForecastWeek[] = [];
  for (let i = 0; i < count; i++) {
    const start = shiftDays(params.firstWeekStart, i * 7);
    const end = shiftDays(start, 6);
    const events = params.events
      .filter((e) => (i === 0 ? e.date <= end : e.date >= start && e.date <= end))
      .sort((a, b) => a.date.localeCompare(b.date));
    const inPence = events.filter((e) => e.amountPence > 0).reduce((t, e) => t + e.amountPence, 0);
    const eventsOut = events.filter((e) => e.amountPence < 0).reduce((t, e) => t - e.amountPence, 0);
    const outPence = eventsOut + params.weeklySpendPence;
    balance += inPence - outPence;
    weeks.push({
      index: i,
      start,
      end,
      inPence,
      outPence,
      spendPence: params.weeklySpendPence,
      closingPence: balance,
      events,
    });
  }
  const lowest = weeks.reduce((min, w) => (w.closingPence < min.closingPence ? w : min), weeks[0]!);
  return {
    openingCashPence: params.openingCashPence,
    weeklySpendPence: params.weeklySpendPence,
    lowCashPence: params.lowCashPence,
    weeks,
    lowest,
    firstBelowLow: weeks.find((w) => w.closingPence < params.lowCashPence) ?? null,
    firstNegative: weeks.find((w) => w.closingPence < 0) ?? null,
  };
}
