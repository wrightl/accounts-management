import { todayIsoDate } from "@/lib/dates";

export type RecurringOnGenerate = "draft" | "send";

export type RecurringLineTemplate = {
  description: string;
  quantity: number;
  unitPricePence: number;
};

/**
 * Next calendar date (YYYY-MM-DD) this template should run.
 * Monthly on dayOfMonth (1–28). If already generated in the current
 * YYYY-MM, advances to next month.
 */
export function computeNextRunOn(
  dayOfMonth: number,
  today: string = todayIsoDate(),
  lastGeneratedAt: Date | null = null,
): string {
  const day = Math.min(28, Math.max(1, Math.floor(dayOfMonth)));
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  const thisYm = today.slice(0, 7);
  const lastYm = lastGeneratedAt
    ? todayIsoDate(lastGeneratedAt).slice(0, 7)
    : null;

  if (d <= day && lastYm !== thisYm) {
    return `${thisYm}-${String(day).padStart(2, "0")}`;
  }

  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  return `${nextY}-${String(nextM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whether the schedule should stop based on ends_on / max_occurrences. */
export function isRecurringExhausted(params: {
  today: string;
  endsOn: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
}): boolean {
  if (params.endsOn && params.endsOn < params.today) return true;
  if (
    params.maxOccurrences != null &&
    params.occurrenceCount >= params.maxOccurrences
  ) {
    return true;
  }
  return false;
}

/** After a successful generate, whether to auto-disable the template. */
export function shouldDisableAfterGenerate(params: {
  nextRunOn: string;
  endsOn: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
}): boolean {
  if (
    params.maxOccurrences != null &&
    params.occurrenceCount >= params.maxOccurrences
  ) {
    return true;
  }
  if (params.endsOn && params.nextRunOn > params.endsOn) return true;
  return false;
}
