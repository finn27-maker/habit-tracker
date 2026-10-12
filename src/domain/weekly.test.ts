import { describe, expect, it } from 'vitest';
import { fastestOf } from '../testing/timing';
import { addDaysToKey } from './dates';
import { latestDayInWeek, targetInForce, weeklyStatus, type TargetPoint } from './weekly';

const point = (effectiveWeekStart: string, target: number): TargetPoint => ({
  effectiveWeekStart,
  target,
});

/** `count` completions in the week that starts on `sunday`, spread over its days. */
const inWeek = (sunday: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => addDaysToKey(sunday, i % 7));

// 2026-10-11 is a Sunday, so today (Wednesday) is in the week 10-11 to 10-17.
const today = '2026-10-14';
const threeWeeks = [
  ...inWeek('2026-09-20', 3),
  ...inWeek('2026-09-27', 3),
  ...inWeek('2026-10-04', 3),
];
const target3 = [point('2026-09-20', 3)];

describe('weeklyStatus: the current week', () => {
  it('counts only completions from the Sunday that starts this week', () => {
    const days = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14'];
    expect(weeklyStatus(days, [point('2026-10-11', 3)], today)).toMatchObject({
      count: 3,
      target: 3,
      met: true,
    });
  });

  it('puts Saturday in the week that ends and Sunday in the one that starts', () => {
    const saturday = weeklyStatus(['2026-10-17'], [point('2026-10-11', 3)], '2026-10-17');
    expect(saturday.count).toBe(1);
    const sunday = weeklyStatus(['2026-10-17'], [point('2026-10-11', 3)], '2026-10-18');
    expect(sunday.count).toBe(0);
  });

  it('keeps counting past the target and counts repeats on one day', () => {
    const days = Array(5).fill('2026-10-14') as string[];
    expect(weeklyStatus(days, [point('2026-10-11', 3)], today)).toMatchObject({
      count: 5,
      met: true,
    });
  });

  it('is not met below the target', () => {
    const status = weeklyStatus(['2026-10-12', '2026-10-13'], [point('2026-10-11', 3)], today);
    expect(status).toMatchObject({ count: 2, met: false });
  });

  it('ignores completions dated after today', () => {
    const status = weeklyStatus(['2026-10-14', '2026-10-16'], [point('2026-10-11', 3)], today);
    expect(status.count).toBe(1);
  });

  it('resets to zero on Sunday', () => {
    const days = inWeek('2026-10-11', 3);
    expect(weeklyStatus(days, [point('2026-10-11', 3)], '2026-10-17').count).toBe(3);
    expect(weeklyStatus(days, [point('2026-10-11', 3)], '2026-10-18').count).toBe(0);
  });
});

describe('weeklyStatus: the weeks-in-a-row streak', () => {
  it('builds on met weeks and is at risk while this week is not met', () => {
    const days = [...threeWeeks, '2026-10-11'];
    expect(weeklyStatus(days, target3, today)).toMatchObject({
      streak: 3,
      met: false,
      streakAtRisk: true,
    });
  });

  it('adds this week once its target is met', () => {
    const days = [...threeWeeks, ...inWeek('2026-10-11', 3)];
    expect(weeklyStatus(days, target3, today)).toMatchObject({
      streak: 4,
      met: true,
      streakAtRisk: false,
    });
  });

  it('resets after a week below target', () => {
    const days = [...inWeek('2026-09-27', 3), ...inWeek('2026-10-04', 2)];
    expect(weeklyStatus(days, target3, today)).toMatchObject({ streak: 0, streakAtRisk: false });
  });

  it('counts a week with more than the target as met', () => {
    const days = [...inWeek('2026-09-27', 3), ...Array(5).fill('2026-10-06')] as string[];
    expect(weeklyStatus(days, target3, today).streak).toBe(2);
  });

  it('does not count weeks before the goal existed', () => {
    const days = [...inWeek('2026-09-27', 3), ...inWeek('2026-10-04', 3)];
    const status = weeklyStatus(days, [point('2026-10-04', 3)], today);
    expect(status.streak).toBe(1);
  });

  it('judges the first, partial week against the full target', () => {
    const days = inWeek('2026-10-04', 2);
    expect(weeklyStatus(days, [point('2026-10-04', 3)], '2026-10-18').streak).toBe(0);
  });

  it('stops at the first missed week even if earlier weeks were met', () => {
    const days = [...inWeek('2026-09-20', 3), ...inWeek('2026-10-04', 3)];
    expect(weeklyStatus(days, target3, today).streak).toBe(1);
  });

  it('counts a year of weeks', () => {
    const start = '2025-10-12';
    const days = Array.from({ length: 52 }, (_, i) => addDaysToKey(start, i * 7));
    const status = weeklyStatus(days, [point(start, 1)], today);
    expect(status.streak).toBe(52);
  });
});

describe('weeklyStatus: versioned targets', () => {
  it('does not rewrite past weeks when the target is raised', () => {
    const targets = [point('2026-09-20', 3), point('2026-10-11', 4)];
    const days = [...threeWeeks, ...inWeek('2026-10-11', 3)];
    expect(weeklyStatus(days, targets, today)).toMatchObject({
      target: 4,
      count: 3,
      met: false,
      streak: 3,
      streakAtRisk: true,
    });
  });

  it('judges a week by the target of that week, not by a later raise', () => {
    const targets = [point('2026-09-20', 3), point('2026-10-04', 4)];
    expect(weeklyStatus(threeWeeks, targets, today).streak).toBe(0);
  });

  it('does not turn a failed week into a met one when the target is lowered', () => {
    const targets = [point('2026-09-20', 4), point('2026-10-11', 3)];
    const days = inWeek('2026-10-04', 3);
    expect(weeklyStatus(days, targets, today).streak).toBe(0);
  });

  it('applies a changed target from its week onwards only', () => {
    const targets = [point('2026-09-20', 3), point('2026-10-11', 4)];
    const days = [...inWeek('2026-09-27', 3), ...inWeek('2026-10-04', 3), ...inWeek('2026-10-11', 3)];
    const status = weeklyStatus(days, targets, today);
    expect(status.streak).toBe(2);
    expect(status.target).toBe(4);
  });

  it('does not depend on the order the target records are given in', () => {
    const targets = [point('2026-10-11', 4), point('2026-09-20', 3)];
    expect(weeklyStatus(threeWeeks, targets, today)).toMatchObject({ target: 4, streak: 3 });
  });

  it("uses the goal's first target when the clock is before it was created", () => {
    const status = weeklyStatus([], [point('2026-10-11', 3)], '2026-10-07');
    expect(status).toMatchObject({ count: 0, target: 3, streak: 0 });
  });

  it('treats a goal with no target history as once a week', () => {
    expect(weeklyStatus(['2026-10-14'], [], today)).toMatchObject({
      count: 1,
      target: 1,
      met: true,
      streak: 0,
    });
  });
});

describe('weeklyStatus: calendar edges', () => {
  it.each([
    ['spring forward Sunday (23 hours)', '2026-03-08', '2026-03-14'],
    ['fall back Sunday (25 hours)', '2026-11-01', '2026-11-07'],
    ['the new year', '2025-12-28', '2026-01-03'],
  ])('a week starting on %s has seven days', (_label, start, end) => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
    expect(days.at(-1)).toBe(end);
    expect(weeklyStatus(days, [point(start, 7)], end)).toMatchObject({ count: 7, met: true });
  });

  it('keeps a streak going across the spring-forward week', () => {
    const days = [...inWeek('2026-03-01', 2), ...inWeek('2026-03-08', 2), ...inWeek('2026-03-15', 2)];
    expect(weeklyStatus(days, [point('2026-03-01', 2)], '2026-03-17').streak).toBe(3);
  });

  it('computes fifty goals with a year of history in well under 50 ms', () => {
    const days = Array.from({ length: 52 }, (_, i) => addDaysToKey('2025-10-12', i * 7));
    const targets = [point('2025-10-12', 1), point('2026-03-01', 1), point('2026-07-05', 1)];
    const elapsed = fastestOf(5, () => {
      for (let i = 0; i < 50; i++) weeklyStatus(days, targets, today);
    });
    expect(elapsed).toBeLessThan(50);
  });
});

describe('targetInForce', () => {
  const targets = [point('2026-09-20', 3), point('2026-10-11', 4)];

  it.each([
    ['before the first record', '2026-09-13', undefined],
    ['on the first record', '2026-09-20', 3],
    ['between records', '2026-10-04', 3],
    ['on the second record', '2026-10-11', 4],
    ['after the last record', '2027-01-03', 4],
  ])('is %s', (_label, weekStart, expected) => {
    expect(targetInForce(targets, weekStart)).toBe(expected);
  });

  it('is undefined with no records', () => {
    expect(targetInForce([], '2026-10-11')).toBeUndefined();
  });

  it('does not depend on the order of the records', () => {
    expect(targetInForce([...targets].reverse(), '2026-10-04')).toBe(3);
  });
});

describe('latestDayInWeek', () => {
  const sunday = '2026-10-11';

  it('returns the latest day within the week', () => {
    expect(latestDayInWeek(['2026-10-12', '2026-10-14', '2026-10-13'], sunday)).toBe('2026-10-14');
  });

  it('ignores other weeks', () => {
    expect(latestDayInWeek(['2026-10-10', '2026-10-18', '2026-10-12'], sunday)).toBe('2026-10-12');
  });

  it('includes both ends of the week', () => {
    expect(latestDayInWeek(['2026-10-11'], sunday)).toBe('2026-10-11');
    expect(latestDayInWeek(['2026-10-17'], sunday)).toBe('2026-10-17');
  });

  it('is undefined when nothing falls in the week', () => {
    expect(latestDayInWeek(['2026-10-10', '2026-10-18'], sunday)).toBeUndefined();
    expect(latestDayInWeek([], sunday)).toBeUndefined();
  });
});
