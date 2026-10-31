import { describe, expect, it } from 'vitest';
import { addDaysToKey } from './dates';
import { dailyRate, historyStats, ratePercent } from './history';

const TODAY = '2026-10-30';
const percent = (rate: ReturnType<typeof dailyRate>) => ratePercent(rate);

describe('dailyRate from the day a habit was added', () => {
  it('counts a skipped day after adding as missed', () => {
    // Added Oct 27 (not done), skipped Oct 28, done Oct 29, today open.
    expect(dailyRate(['2026-10-29'], TODAY, 30, '2026-10-27')).toEqual({ done: 1, total: 2 });
    expect(historyStats('daily', ['2026-10-29'], [], TODAY, '2026-10-27')).toMatchObject({
      current: 1,
      best: 1,
      recent: { done: 1, total: 2 },
      allTime: { done: 1, total: 2 },
    });
  });

  it('counts the day it was added only once done', () => {
    expect(dailyRate([TODAY], TODAY, 30, '2026-10-29')).toEqual({ done: 1, total: 1 });
    expect(percent(dailyRate(['2026-10-28', TODAY], TODAY, 30, '2026-10-28'))).toBe(67);
  });

  it('has nothing to measure on the day it is added, and 0% when never done', () => {
    expect(dailyRate([], TODAY, 30, TODAY)).toEqual({ done: 0, total: 0 });
    expect(dailyRate([], TODAY, 30, '2026-10-27')).toEqual({ done: 0, total: 2 });
  });

  it('starts the last 30 days no earlier than the habit, and the window no earlier than 30 days', () => {
    const started = addDaysToKey(TODAY, -60);
    const last15 = Array.from({ length: 15 }, (_, i) => addDaysToKey(TODAY, -i));
    expect(dailyRate(last15, TODAY, 30, started)).toEqual({ done: 15, total: 30 });
    expect(percent(dailyRate(last15, TODAY, undefined, started))).toBe(25);
  });

  it('counts from an earlier backfilled check-in', () => {
    expect(dailyRate(['2026-10-20'], TODAY, undefined, '2026-10-27')).toEqual({ done: 1, total: 10 });
  });

  it('keeps counting from the first check-in for habits with no start day', () => {
    expect(dailyRate(['2026-10-29'], TODAY, 30)).toEqual({ done: 1, total: 1 });
    expect(dailyRate([], TODAY, 30)).toEqual({ done: 0, total: 0 });
  });

  it('leaves weekly goals as they were', () => {
    const targets = [{ effectiveWeekStart: '2026-10-11', target: 1 }];
    expect(historyStats('weekly', ['2026-10-12'], targets, TODAY, '2026-10-27')).toEqual(
      historyStats('weekly', ['2026-10-12'], targets, TODAY),
    );
  });
});
