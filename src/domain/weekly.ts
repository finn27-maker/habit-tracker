import { dayNumber, weekNumber } from './dates';

/** From this Sunday on (until a later point), the goal's target is `target`. */
export interface TargetPoint {
  effectiveWeekStart: string;
  target: number;
}

export interface WeeklyStatus {
  /** Completions this week; keeps counting past the target. */
  count: number;
  /** The target in force this week. */
  target: number;
  met: boolean;
  /** Consecutive weeks that reached their own target, including this one once met. */
  streak: number;
  /** Streak alive but this week's target is not met yet. */
  streakAtRisk: boolean;
}

/** A target record with its week resolved to a number once, so streak loops stay cheap. */
interface WeekTarget {
  week: number;
  target: number;
}

function weekTargets(points: readonly TargetPoint[]): WeekTarget[] {
  return [...points]
    .sort((a, b) => a.effectiveWeekStart.localeCompare(b.effectiveWeekStart))
    .map((point) => ({ week: weekNumber(point.effectiveWeekStart), target: point.target }));
}

/** `sorted` must be ordered by week. */
function targetForWeek(sorted: readonly WeekTarget[], week: number): number | undefined {
  let found: number | undefined;
  for (const entry of sorted) {
    if (entry.week > week) break;
    found = entry.target;
  }
  return found;
}

/**
 * The target that applied to the week starting on `weekStart`: the latest record on or
 * before it, or undefined if the goal did not exist yet. Past weeks keep the target they
 * had, so raising or lowering a target never rewrites history.
 */
export function targetInForce(points: readonly TargetPoint[], weekStart: string): number | undefined {
  return targetForWeek(weekTargets(points), weekNumber(weekStart));
}

/**
 * Derived on every read from the completion days (never stored). Weeks run Sunday to
 * Saturday. Days after `today` are ignored. The week in progress is not a failure: the
 * streak carries from earlier weeks until this one is met.
 */
export function weeklyStatus(
  days: readonly string[],
  targets: readonly TargetPoint[],
  today: string,
): WeeklyStatus {
  const sorted = weekTargets(targets);
  const todayNumber = dayNumber(today);
  const currentWeek = weekNumber(today);

  const perWeek = new Map<number, number>();
  for (const day of days) {
    if (dayNumber(day) > todayNumber) continue;
    const week = weekNumber(day);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  // If the clock predates the goal's first record, use that first target; a goal with no
  // history at all counts as once a week.
  const target = targetForWeek(sorted, currentWeek) ?? sorted[0]?.target ?? 1;
  const count = perWeek.get(currentWeek) ?? 0;
  const met = count >= target;

  let streak = 0;
  for (let week = met ? currentWeek : currentWeek - 1; ; week -= 1) {
    const weekTarget = targetForWeek(sorted, week);
    if (weekTarget === undefined || (perWeek.get(week) ?? 0) < weekTarget) break;
    streak += 1;
  }

  return { count, target, met, streak, streakAtRisk: !met && streak > 0 };
}

/**
 * The day an undo takes back: the latest day in the week that starts on `weekStart`.
 * (Within that day, the repository removes the entry logged last.)
 */
export function latestDayInWeek(days: readonly string[], weekStart: string): string | undefined {
  const first = dayNumber(weekStart);
  const last = first + 6;
  let latest: string | undefined;
  for (const day of days) {
    const number = dayNumber(day);
    if (number < first || number > last) continue;
    if (latest === undefined || day > latest) latest = day;
  }
  return latest;
}
