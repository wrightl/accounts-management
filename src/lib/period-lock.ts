import { formatIsoDateUk } from "@/lib/dates";

/** YYYY-MM-DD from a date string or Date (Europe/London calendar day for Dates). */
function toIsoDay(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(value);
}

/** Whether a document dated `date` falls in the locked period. */
export function isDateLocked(
  date: string | Date | null | undefined,
  lockedThrough: string | null | undefined,
): boolean {
  if (!date || !lockedThrough) return false;
  return toIsoDay(date) <= lockedThrough;
}

export function periodLockedMessage(lockedThrough: string): string {
  return `The books are locked up to ${formatIsoDateUk(lockedThrough)}. Ask an admin or your accountant to move the lock date before changing anything dated on or before it.`;
}

/**
 * Error message when any of `dates` is in the locked period, else null.
 * Pass every date the change touches (e.g. both the old and new date on an edit).
 */
export function periodLockError(
  lockedThrough: string | null | undefined,
  ...dates: Array<string | Date | null | undefined>
): string | null {
  if (!lockedThrough) return null;
  return dates.some((d) => isDateLocked(d, lockedThrough))
    ? periodLockedMessage(lockedThrough)
    : null;
}
