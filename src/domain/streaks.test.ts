import { describe, expect, it } from 'vitest';
import { addDaysToKey } from './dates';
import { dailyStreak } from './streaks';

const range = (start: string, end: string): string[] => {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDaysToKey(day, 1)) days.push(day);
  return days;
};

describe('dailyStreak', () => {
  const today = '2026-10-14';

  it('is zero for a habit with no completions', () => {
    expect(dailyStreak([], today)).toEqual({ current: 0, doneToday: false, atRisk: false });
  });

  it('counts only today when it is the only day done', () => {
    expect(dailyStreak([today], today)).toEqual({ current: 1, doneToday: true, atRisk: false });
  });

  it('builds a streak across consecutive days including today', () => {
    const days = ['2026-10-11', '2026-10-12', '2026-10-13', today];
    expect(dailyStreak(days, today)).toEqual({ current: 4, doneToday: true, atRisk: false });
  });

  it("keeps yesterday's streak, at risk, until today is done", () => {
    expect(dailyStreak(['2026-10-12', '2026-10-13'], today)).toEqual({
      current: 2,
      doneToday: false,
      atRisk: true,
    });
  });

  it('resets to zero after a missed day', () => {
    expect(dailyStreak(['2026-10-11', '2026-10-12'], today)).toEqual({
      current: 0,
      doneToday: false,
      atRisk: false,
    });
  });

  it('starts a new streak of 1 when today is done after a gap', () => {
    const days = ['2026-10-10', '2026-10-11', today];
    expect(dailyStreak(days, today)).toEqual({ current: 1, doneToday: true, atRisk: false });
  });

  it('un-checking today falls back to the at-risk streak', () => {
    const before = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', today];
    expect(dailyStreak(before, today).current).toBe(6);
    expect(dailyStreak(before.slice(0, -1), today)).toEqual({
      current: 5,
      doneToday: false,
      atRisk: true,
    });
  });

  it('ignores duplicate completions', () => {
    expect(dailyStreak(['2026-10-13', '2026-10-13', '2026-10-13'], today).current).toBe(1);
  });

  it('ignores completions dated after today', () => {
    expect(dailyStreak(['2026-10-13', '2026-10-15', '2026-10-16'], today).current).toBe(1);
  });

  it('does not care about the order completions are listed in', () => {
    expect(dailyStreak(['2026-10-13', today, '2026-10-12'], today).current).toBe(3);
  });

  it.each([
    ['spring forward (2026-03-08, 23 hours)', '2026-03-06', '2026-03-10', 5],
    ['fall back (2026-11-01, 25 hours)', '2026-10-30', '2026-11-03', 5],
    ['year boundary', '2025-12-30', '2026-01-02', 4],
    ['leap day 2028-02-29', '2028-02-27', '2028-03-01', 4],
  ])('survives %s', (_label, start, end, expected) => {
    expect(dailyStreak(range(start, end), end).current).toBe(expected);
  });

  it('counts a year-long streak', () => {
    const end = '2026-10-14';
    const days = range(addDaysToKey(end, -364), end);
    expect(days).toHaveLength(365);
    expect(dailyStreak(days, end).current).toBe(365);
  });
});
