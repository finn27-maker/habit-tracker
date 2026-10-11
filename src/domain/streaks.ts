import { dayNumber } from './dates';

export interface DailyStreak {
  /** Consecutive days ending today, or ending yesterday while today is still open. */
  current: number;
  doneToday: boolean;
  /** Streak alive but today not done yet: it ends if today is missed. */
  atRisk: boolean;
}

/**
 * Strict streak: a missed day resets it to 0. Derived on every read from the
 * completion days (never stored), so un-checking and backfilling can't corrupt it.
 * Duplicates and days after `today` are ignored.
 */
export function dailyStreak(days: readonly string[], today: string): DailyStreak {
  const done = new Set(days.map(dayNumber));
  const todayNumber = dayNumber(today);
  const doneToday = done.has(todayNumber);

  let current = 0;
  for (let day = doneToday ? todayNumber : todayNumber - 1; done.has(day); day -= 1) current += 1;

  return { current, doneToday, atRisk: !doneToday && current > 0 };
}
