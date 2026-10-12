import { addDaysToKey, dayNumber, weekNumber, weekStartKey } from './dates';
import { dailyStreak } from './streaks';
import { targetForWeek, weekTargets, weeklyStatus, type TargetPoint } from './weekly';

/** Everything the detail page's stat tiles show. */
export interface HistoryStats {
  /** Streaks count days for habits and weeks for goals. */
  unit: 'day' | 'week';
  current: number;
  best: number;
  /** "Last 30 days" for habits, "Last 12 weeks" for goals. */
  recentLabel: string;
  recent: Rate;
  allTime: Rate;
  /** Completions ever logged. */
  total: number;
}

export function historyStats(
  type: 'daily' | 'weekly',
  days: readonly string[],
  targets: readonly TargetPoint[],
  today: string,
): HistoryStats {
  const total = days.filter((day) => day <= today).length;
  if (type === 'daily') {
    return {
      unit: 'day',
      current: dailyStreak(days, today).current,
      best: bestDailyStreak(days, today),
      recentLabel: 'Last 30 days',
      recent: dailyRate(days, today, 30),
      allTime: dailyRate(days, today),
      total,
    };
  }
  const history = weeklyHistory(days, targets, today);
  return {
    unit: 'week',
    current: weeklyStatus(days, targets, today).streak,
    best: bestWeeklyStreak(history),
    recentLabel: 'Last 12 weeks',
    recent: weeklyRate(history, 12),
    allTime: weeklyRate(history),
    total,
  };
}

/** "1 day", "3 weeks". */
export const countLabel = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** `done` out of `total` days (or weeks). Nothing to measure yet when total is 0. */
export interface Rate {
  done: number;
  total: number;
}

/** A whole percent, or null when there is nothing to measure (shown as a dash, not 0%). */
export function ratePercent({ done, total }: Rate): number | null {
  return total === 0 ? null : Math.round((done / total) * 100);
}

/** Distinct completed day numbers up to and including today. */
function doneDays(days: readonly string[], today: string): Set<number> {
  const last = dayNumber(today);
  const done = new Set<number>();
  for (const day of days) {
    const number = dayNumber(day);
    if (number <= last) done.add(number);
  }
  return done;
}

/** The longest run of consecutive done days ever, ignoring days after today. */
export function bestDailyStreak(days: readonly string[], today: string): number {
  const sorted = [...doneDays(days, today)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    run = i > 0 && sorted[i]! === sorted[i - 1]! + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Days done out of days measured, from the first completion (or the last `windowDays` days,
 * whichever is later) to today. Today only counts once it is done: an open day is not a miss.
 */
export function dailyRate(days: readonly string[], today: string, windowDays?: number): Rate {
  const done = doneDays(days, today);
  if (done.size === 0) return { done: 0, total: 0 };

  const todayNumber = dayNumber(today);
  const first = Math.min(...done);
  const start = windowDays === undefined ? first : Math.max(first, todayNumber - windowDays + 1);
  const end = done.has(todayNumber) ? todayNumber : todayNumber - 1;

  let count = 0;
  for (const day of done) if (day >= start && day <= end) count += 1;
  return { done: count, total: Math.max(0, end - start + 1) };
}

export interface WeekResult {
  /** The Sunday that starts the week. */
  weekStart: string;
  count: number;
  /** The target in force that week. */
  target: number;
  met: boolean;
}

/**
 * Every week from the goal's first target record to this week, oldest first, each judged
 * by the target in force then. Logs after today are ignored.
 */
export function weeklyHistory(
  days: readonly string[],
  targets: readonly TargetPoint[],
  today: string,
): WeekResult[] {
  const sorted = weekTargets(targets);
  const firstPoint = [...targets].sort((a, b) => a.effectiveWeekStart.localeCompare(b.effectiveWeekStart))[0];
  if (!firstPoint) return [];

  const todayNumber = dayNumber(today);
  const perWeek = new Map<number, number>();
  for (const day of days) {
    if (dayNumber(day) > todayNumber) continue;
    const week = weekNumber(day);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  const firstStart = weekStartKey(firstPoint.effectiveWeekStart);
  const weeks = weekNumber(today) - weekNumber(firstStart) + 1;
  return Array.from({ length: Math.max(0, weeks) }, (_, i) => {
    const weekStart = addDaysToKey(firstStart, i * 7);
    const week = weekNumber(weekStart);
    const count = perWeek.get(week) ?? 0;
    const target = targetForWeek(sorted, week)!;
    return { weekStart, count, target, met: count >= target };
  });
}

/** The longest run of consecutive met weeks. */
export function bestWeeklyStreak(history: readonly WeekResult[]): number {
  let best = 0;
  let run = 0;
  for (const week of history) {
    run = week.met ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Weeks met out of weeks measured, over the last `windowWeeks` weeks or all of them. This
 * week (the last entry) only counts once it is met.
 */
export function weeklyRate(history: readonly WeekResult[], windowWeeks?: number): Rate {
  const recent = windowWeeks === undefined ? history : history.slice(-windowWeeks);
  const current = recent.at(-1);
  const measured = current && !current.met ? recent.slice(0, -1) : recent;
  return { done: measured.filter((week) => week.met).length, total: measured.length };
}

/** A calendar month: `month` is 0 for January. */
export interface Month {
  year: number;
  month: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

/** The month's days as Sunday-first weeks, with null for the blanks before and after it. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const lead = new Date(year, month, 1).getDay();
  const length = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** "October 2026". */
export function monthLabel({ year, month }: Month): string {
  return monthName.format(new Date(year, month, 1));
}

/** `weeks` Sunday-first columns of day keys, the last one being the week that holds today. */
export function heatmapWeeks(today: string, weeks = 26): string[][] {
  const first = addDaysToKey(weekStartKey(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDaysToKey(first, w * 7 + d)),
  );
}

/** How many logs fall on each day. */
export function dayCounts(days: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1);
  return counts;
}

/** Heatmap shade: 0 for none, then 1 to 3 for one, two, or three or more logs. */
export function heatLevel(count: number): number {
  return Math.min(count, 3);
}

/** Done days in the heatmap out of the days it measures (no future days; today once done). */
export function heatmapSummary(
  weeks: readonly (readonly string[])[],
  done: ReadonlySet<string>,
  today: string,
): Rate {
  let doneCount = 0;
  let total = 0;
  for (const day of weeks.flat()) {
    if (day > today || (day === today && !done.has(day))) continue;
    total += 1;
    if (done.has(day)) doneCount += 1;
  }
  return { done: doneCount, total };
}
