import { addDays, format } from 'date-fns';

/**
 * Days are identified by their LOCAL calendar date, "YYYY-MM-DD". Never use
 * toISOString() for this: after 7pm in Chicago it already returns tomorrow's date.
 */
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Local midnight at the start of that day. */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

/** Steps whole calendar days; never add 24 hours (DST days have 23 or 25). */
export function addDaysToKey(key: string, days: number): string {
  return dayKey(addDays(parseDayKey(key), days));
}

/**
 * A day's position on the calendar as a whole number, so consecutive days differ by
 * exactly 1. Computed in UTC on purpose: UTC has no daylight saving, and this is only
 * used to compare calendar dates, never to show a time. Cheap enough for hot loops.
 */
export function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
}

export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(parseDayKey(value)) === value;
}

/** The next local midnight strictly after `now`, correct on 23- and 25-hour days. */
export function nextLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}
