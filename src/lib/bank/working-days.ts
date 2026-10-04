/**
 * England & Wales working-day helpers for bank reconciliation date windows.
 * Weekends and England & Wales bank holidays are non-working.
 */

import { dateDiffDays } from "@/lib/bank/match";

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Weekday 0=Sun … 6=Sat in UTC noon (avoids DST edge cases). */
function weekdayUtc(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function addCalendarDays(iso: string, delta: number): string {
  const { y, m, d } = parseIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Anonymous Gregorian algorithm → Easter Sunday as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(year, month, day);
}

function firstMondayOfMonth(year: number, month: number): string {
  let iso = toIso(year, month, 1);
  while (weekdayUtc(iso) !== 1) {
    iso = addCalendarDays(iso, 1);
  }
  return iso;
}

function lastMondayOfMonth(year: number, month: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let iso = addCalendarDays(toIso(nextYear, nextMonth, 1), -1);
  while (weekdayUtc(iso) !== 1) {
    iso = addCalendarDays(iso, -1);
  }
  return iso;
}

/** Substitute: if date falls on Sat/Sun, next Monday (or Tue for Boxing when Christmas is Sat). */
function substituteObservance(iso: string): string {
  const wd = weekdayUtc(iso);
  if (wd === 6) return addCalendarDays(iso, 2); // Sat → Mon
  if (wd === 0) return addCalendarDays(iso, 1); // Sun → Mon
  return iso;
}

/**
 * England & Wales bank holiday dates for a given year (observed dates).
 * Includes New Year, Good Friday, Easter Monday, Early May, Spring, Summer,
 * Christmas, and Boxing Day (with weekend substitutions).
 */
export function englandWalesBankHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const holidays = new Set<string>();

  holidays.add(substituteObservance(toIso(year, 1, 1)));
  holidays.add(addCalendarDays(easter, -2)); // Good Friday
  holidays.add(addCalendarDays(easter, 1)); // Easter Monday
  holidays.add(firstMondayOfMonth(year, 5)); // Early May
  holidays.add(lastMondayOfMonth(year, 5)); // Spring
  holidays.add(lastMondayOfMonth(year, 8)); // Summer

  const christmas = toIso(year, 12, 25);
  const boxing = toIso(year, 12, 26);
  const xmasWd = weekdayUtc(christmas);
  if (xmasWd === 6) {
    // Sat Christmas → Mon 27; Boxing Sun → Tue 28
    holidays.add(addCalendarDays(christmas, 2));
    holidays.add(addCalendarDays(boxing, 2));
  } else if (xmasWd === 0) {
    // Sun Christmas → Mon 26; Boxing Mon → Tue 27
    holidays.add(addCalendarDays(christmas, 1));
    holidays.add(addCalendarDays(boxing, 1));
  } else if (xmasWd === 5) {
    // Fri Christmas; Boxing Sat → Mon 28
    holidays.add(christmas);
    holidays.add(addCalendarDays(boxing, 2));
  } else {
    holidays.add(substituteObservance(christmas));
    holidays.add(substituteObservance(boxing));
  }

  return holidays;
}

const holidayCache = new Map<number, Set<string>>();

function holidaysForYear(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = englandWalesBankHolidays(year);
    holidayCache.set(year, set);
  }
  return set;
}

export function isEnglandWalesWorkingDay(iso: string): boolean {
  const wd = weekdayUtc(iso);
  if (wd === 0 || wd === 6) return false;
  const year = parseIso(iso).y;
  return !holidaysForYear(year).has(iso);
}

/**
 * Absolute working-day distance between two ISO dates (inclusive steps).
 * Same working day → 0. Adjacent working days → 1.
 * Non-working days between the two do not count.
 */
export function workingDayDistance(a: string, b: string): number {
  if (a === b) return 0;
  const calendar = Math.abs(dateDiffDays(a, b));
  if (calendar === 0) return 0;

  const earlier = a < b ? a : b;
  const later = a < b ? b : a;
  let count = 0;
  let cursor = earlier;
  while (cursor < later) {
    cursor = addCalendarDays(cursor, 1);
    if (isEnglandWalesWorkingDay(cursor)) count += 1;
  }
  return count;
}

/** True when |working days between a and b| ≤ maxWorkingDays. */
export function withinWorkingDayWindow(
  a: string,
  b: string,
  maxWorkingDays: number,
): boolean {
  return workingDayDistance(a, b) <= maxWorkingDays;
}
