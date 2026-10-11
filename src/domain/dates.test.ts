import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  dayKey,
  dayNumber,
  isDayKey,
  nextLocalMidnight,
  parseDayKey,
} from './dates';

const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

describe('test environment', () => {
  it('runs in America/Chicago so the daylight-saving cases are meaningful', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Chicago');
  });
});

describe('dayKey', () => {
  it('uses the local calendar day, not the UTC day', () => {
    const lateEvening = new Date(2026, 9, 14, 23, 30); // already the 15th in UTC
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(dayKey(lateEvening)).toBe('2026-10-14');
  });

  it('pads the month and day', () => {
    expect(dayKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('parseDayKey', () => {
  it('returns local midnight of that day', () => {
    const date = parseDayKey('2026-03-08');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 2, 8]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });
});

describe('addDaysToKey', () => {
  it.each([
    ['2026-10-14', 0, '2026-10-14'],
    ['2026-10-14', 1, '2026-10-15'],
    ['2026-10-14', -1, '2026-10-13'],
    ['2026-03-07', 1, '2026-03-08'], // spring forward: a 23-hour day
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-03-09', -1, '2026-03-08'],
    ['2026-10-31', 1, '2026-11-01'], // fall back: a 25-hour day
    ['2026-11-01', 1, '2026-11-02'],
    ['2026-11-02', -1, '2026-11-01'],
    ['2025-12-31', 1, '2026-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-02-28', 1, '2028-02-29'], // leap day
    ['2028-02-29', 1, '2028-03-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-10-14', 30, '2026-11-13'],
  ])('%s plus %i days is %s', (start, days, expected) => {
    expect(addDaysToKey(start, days)).toBe(expected);
  });
});

describe('dayNumber', () => {
  it.each([
    ['2026-10-13', '2026-10-14'],
    ['2026-03-07', '2026-03-08'],
    ['2026-03-08', '2026-03-09'],
    ['2026-10-31', '2026-11-01'],
    ['2026-11-01', '2026-11-02'],
    ['2025-12-31', '2026-01-01'],
    ['2028-02-28', '2028-02-29'],
  ])('%s and %s are exactly one day apart', (earlier, later) => {
    expect(dayNumber(later) - dayNumber(earlier)).toBe(1);
  });

  it('is a whole number', () => {
    expect(Number.isInteger(dayNumber('2026-10-14'))).toBe(true);
  });
});

describe('isDayKey', () => {
  it.each(['2026-10-14', '2028-02-29', '2026-01-01'])('accepts %s', (value) => {
    expect(isDayKey(value)).toBe(true);
  });

  it.each(['', 'abc', '2026-1-1', '2026-13-01', '2026-02-30', '2027-02-29', '2026-10-14T00:00'])(
    'rejects %j',
    (value) => {
      expect(isDayKey(value)).toBe(false);
    },
  );
});

describe('nextLocalMidnight', () => {
  it.each([
    ['an ordinary evening', new Date(2026, 9, 14, 23, 0), new Date(2026, 9, 15, 0, 0), 1],
    ['just after midnight', new Date(2026, 9, 14, 0, 0, 1), new Date(2026, 9, 15, 0, 0), 23.9997],
    ['spring forward eve', new Date(2026, 2, 7, 23, 0), new Date(2026, 2, 8, 0, 0), 1],
    ['the 23-hour day', new Date(2026, 2, 8, 0, 30), new Date(2026, 2, 9, 0, 0), 22.5],
    ['fall back eve', new Date(2026, 9, 31, 23, 0), new Date(2026, 10, 1, 0, 0), 1],
    ['the 25-hour day', new Date(2026, 10, 1, 0, 30), new Date(2026, 10, 2, 0, 0), 24.5],
    ['new year', new Date(2026, 11, 31, 12, 0), new Date(2027, 0, 1, 0, 0), 12],
  ])('%s', (_label, now, expected, hours) => {
    const next = nextLocalMidnight(now);
    expect(next.getTime()).toBe(expected.getTime());
    expect(hoursBetween(now, next)).toBeCloseTo(hours, 3);
  });

  it('is strictly after exactly midnight', () => {
    const midnight = new Date(2026, 9, 14, 0, 0, 0, 0);
    expect(nextLocalMidnight(midnight).getTime()).toBe(new Date(2026, 9, 15).getTime());
  });
});
