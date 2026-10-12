import { describe, expect, it } from 'vitest';
import { fastestOf } from '../testing/timing';
import { addDaysToKey } from './dates';
import {
  bestDailyStreak,
  bestWeeklyStreak,
  countLabel,
  dailyRate,
  historyStats,
  dayCounts,
  heatLevel,
  heatmapSummary,
  heatmapWeeks,
  monthGrid,
  monthLabel,
  ratePercent,
  shiftMonth,
  weeklyHistory,
  weeklyRate,
} from './history';
import type { TargetPoint } from './weekly';

// 2026-10-14 is a Wednesday, in the week that started on Sunday 2026-10-11.
const today = '2026-10-14';
const range = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => addDaysToKey(from, i));
const meditate = [...range('2026-10-01', 5), ...range('2026-10-12', 3)];

describe('bestDailyStreak', () => {
  it('finds the longest run of consecutive days', () => {
    expect(bestDailyStreak(meditate, today)).toBe(5);
  });

  it('ignores duplicates, order and days after today', () => {
    expect(bestDailyStreak(['2026-10-13', '2026-10-12', '2026-10-13'], today)).toBe(2);
    expect(bestDailyStreak(range('2026-10-15', 4), today)).toBe(0);
  });

  it('is 0 with no history and counts a run across a month and DST change', () => {
    expect(bestDailyStreak([], today)).toBe(0);
    expect(bestDailyStreak(range('2026-10-28', 10), '2026-11-10')).toBe(10);
  });
});

describe('dailyRate', () => {
  it('counts from the first completion, including today once done', () => {
    expect(dailyRate(meditate, today, 30)).toEqual({ done: 8, total: 14 });
    expect(dailyRate(meditate, today)).toEqual({ done: 8, total: 14 });
  });

  it('leaves today out while it is still open', () => {
    expect(dailyRate(range('2026-10-10', 4), today, 30)).toEqual({ done: 4, total: 4 });
  });

  it('limits the window to the last N days', () => {
    const days = ['2026-08-01', today];
    expect(dailyRate(days, today, 30)).toEqual({ done: 1, total: 30 });
    expect(dailyRate(days, today)).toEqual({ done: 2, total: 75 });
  });

  it('is empty with no completions and ignores future days', () => {
    expect(dailyRate([], today, 30)).toEqual({ done: 0, total: 0 });
    expect(dailyRate(['2026-10-20'], today)).toEqual({ done: 0, total: 0 });
  });
});

describe('ratePercent', () => {
  it('rounds to a whole percent, and is null with nothing to measure', () => {
    expect(ratePercent({ done: 8, total: 14 })).toBe(57);
    expect(ratePercent({ done: 1, total: 30 })).toBe(3);
    expect(ratePercent({ done: 1, total: 75 })).toBe(1);
    expect(ratePercent({ done: 0, total: 0 })).toBeNull();
  });
});

describe('weekly history', () => {
  const target = (effectiveWeekStart: string, value: number): TargetPoint => ({
    effectiveWeekStart,
    target: value,
  });
  const inWeek = (sunday: string, count: number) =>
    Array.from({ length: count }, (_, i) => addDaysToKey(sunday, i % 7));
  const peloton = [
    ...inWeek('2026-09-13', 3),
    ...inWeek('2026-09-20', 3),
    ...inWeek('2026-09-27', 1),
    ...inWeek('2026-10-04', 4),
    '2026-10-12',
  ];
  const targets = [target('2026-09-13', 3)];
  const history = weeklyHistory(peloton, targets, today);

  it('lists every week from the goal’s first target to this week', () => {
    expect(history.map((week) => [week.weekStart, week.count, week.target, week.met])).toEqual([
      ['2026-09-13', 3, 3, true],
      ['2026-09-20', 3, 3, true],
      ['2026-09-27', 1, 3, false],
      ['2026-10-04', 4, 3, true],
      ['2026-10-11', 1, 3, false],
    ]);
  });

  it('finds the best run of met weeks', () => {
    expect(bestWeeklyStreak(history)).toBe(2);
    expect(bestWeeklyStreak([])).toBe(0);
  });

  it('rates weeks met, leaving this week out until it is met', () => {
    expect(weeklyRate(history, 12)).toEqual({ done: 3, total: 4 });
    expect(weeklyRate(history)).toEqual({ done: 3, total: 4 });
    const metNow = weeklyHistory([...peloton, '2026-10-13', '2026-10-14'], targets, today);
    expect(weeklyRate(metNow, 2)).toEqual({ done: 2, total: 2 });
  });

  it('judges each week by the target in force then', () => {
    const changed = weeklyHistory(
      [...inWeek('2026-09-27', 2), ...inWeek('2026-10-04', 3)],
      [target('2026-09-27', 2), target('2026-10-04', 4)],
      today,
    );
    expect(changed.map((week) => week.met)).toEqual([true, false, false]);
  });

  it('is empty for a goal with no targets, and ignores future logs', () => {
    expect(weeklyHistory(['2026-10-12'], [], today)).toEqual([]);
    expect(weeklyHistory(['2026-10-12'], [target('2026-10-18', 3)], today)).toEqual([]);
    expect(weeklyHistory(['2026-10-20'], targets, today).at(-1)?.count).toBe(0);
  });
});

describe('monthGrid', () => {
  it('lays a month out in Sunday-first weeks with blanks outside it', () => {
    const october = monthGrid(2026, 9);
    expect(october[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(october.at(-1)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(october).toHaveLength(5);
  });

  it('handles February in a leap year and a month that starts on Sunday', () => {
    const february = monthGrid(2028, 1);
    expect(february.flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2026, 10)[0]![0]).toBe('2026-11-01');
  });
});

describe('month navigation', () => {
  it('moves across year boundaries and names the month', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(monthLabel({ year: 2026, month: 9 })).toBe('October 2026');
  });
});

describe('heatmap', () => {
  it('covers 26 Sunday-first weeks ending with this week', () => {
    const weeks = heatmapWeeks(today);
    expect(weeks).toHaveLength(26);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.at(-1)).toEqual(range('2026-10-11', 7));
    expect(weeks[0]![0]).toBe('2026-04-19');
  });

  it('counts logs per day and shades up to 3 levels', () => {
    const counts = dayCounts(['2026-10-12', '2026-10-13', '2026-10-13']);
    expect(counts.get('2026-10-12')).toBe(1);
    expect(counts.get('2026-10-13')).toBe(2);
    expect([0, 1, 2, 3, 7].map(heatLevel)).toEqual([0, 1, 2, 3, 3]);
  });

  it('summarises done days, leaving out future days and an open today', () => {
    expect(heatmapSummary(heatmapWeeks(today), new Set(meditate), today)).toEqual({ done: 8, total: 179 });
    const notToday = new Set(meditate.filter((day) => day !== today));
    expect(heatmapSummary(heatmapWeeks(today), notToday, today)).toEqual({ done: 7, total: 178 });
  });
});

describe('historyStats', () => {
  it('gathers a daily habit’s tiles', () => {
    expect(historyStats('daily', meditate, [], today)).toEqual({
      unit: 'day',
      current: 3,
      best: 5,
      recentLabel: 'Last 30 days',
      recent: { done: 8, total: 14 },
      allTime: { done: 8, total: 14 },
      total: 8,
    });
  });

  it('gathers a weekly goal’s tiles, counting every log', () => {
    const logs = [
      ...range('2026-09-13', 3),
      ...range('2026-09-20', 3),
      '2026-09-27',
      ...range('2026-10-04', 3),
      '2026-10-12',
    ];
    expect(historyStats('weekly', logs, [{ effectiveWeekStart: '2026-09-13', target: 3 }], today)).toEqual({
      unit: 'week',
      current: 1,
      best: 2,
      recentLabel: 'Last 12 weeks',
      recent: { done: 3, total: 4 },
      allTime: { done: 3, total: 4 },
      total: 11,
    });
  });

  it('labels counts with the right plural', () => {
    expect(countLabel(1, 'day')).toBe('1 day');
    expect(countLabel(0, 'week')).toBe('0 weeks');
  });
});

describe('speed', () => {
  it('computes three years of history in under 50 ms', () => {
    const days = Array.from({ length: 1000 }, (_, i) => addDaysToKey('2023-10-01', i + Math.floor(i / 7)));
    const logs = Array.from({ length: 600 }, (_, i) => addDaysToKey('2023-10-01', Math.floor(i * 1.8)));
    const targets = [{ effectiveWeekStart: '2023-10-01', target: 3 }];
    const ms = fastestOf(5, () => {
      bestDailyStreak(days, today);
      dailyRate(days, today, 30);
      dailyRate(days, today);
      const history = weeklyHistory(logs, targets, today);
      bestWeeklyStreak(history);
      weeklyRate(history);
      monthGrid(2026, 9);
      heatmapSummary(heatmapWeeks(today), new Set(days), today);
      dayCounts(logs);
    });
    expect(ms).toBeLessThan(50);
  });
});
