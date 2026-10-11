import { daysBetween } from "@/lib/late-payment";

/** Steps offered in Settings, in days relative to the due date. */
export const REMINDER_STEP_OPTIONS = [-7, -3, -1, 1, 3, 7, 14, 21, 30, 45, 60] as const;

export const DEFAULT_REMINDER_SCHEDULE = [-3, 1, 7, 14];

export function reminderStepLabel(step: number): string {
  if (step < 0) return step === -1 ? "1 day before due" : `${-step} days before due`;
  if (step === 0) return "On the due date";
  return step === 1 ? "1 day overdue" : `${step} days overdue`;
}

/** Sorted, de-duplicated steps limited to the offered options. */
export function normaliseSchedule(days: number[]): number[] {
  const allowed = new Set<number>(REMINDER_STEP_OPTIONS);
  return [...new Set(days)].filter((d) => allowed.has(d)).sort((a, b) => a - b);
}

/**
 * The reminder step an invoice has reached today, or null. Only the latest
 * step is returned, so a missed day never sends a burst of old reminders.
 * A before-due step is skipped once the invoice is due, and for invoices
 * issued on or after that step's date.
 */
export function dueReminderStep(params: {
  schedule: number[];
  dueDate: string;
  issueDate: string | null;
  today: string;
}): number | null {
  const offset = daysBetween(params.dueDate, params.today);
  const reached = params.schedule.filter((s) => s <= offset);
  if (reached.length === 0) return null;
  const step = Math.max(...reached);
  if (step < 0) {
    if (offset >= 0) return null;
    const stepDate = daysBetween(params.dueDate, params.issueDate ?? params.today);
    if (stepDate >= step) return null;
  }
  return step;
}
