import { describe, expect, it } from 'vitest';
import {
  FALLBACK_NOTE,
  MAX_DUE_DAYS,
  arrivalsNote,
  dueDays,
  dueSummary,
  parsePush,
  type NotifyTodo,
} from './notify';

const todo = (title: string, extra: Partial<NotifyTodo> = {}, order = 0): NotifyTodo => ({
  type: 'todo',
  title,
  order,
  ...extra,
});

// Friday 2026-11-20.
const TODAY = '2026-11-20';
const phone = [
  todo('Update pitch deck', {}, 0),
  todo('Send term sheet', { dueDate: '2026-11-20' }, 1),
  todo('Call the bank', { dueDate: '2026-11-24' }, 2),
  todo('Pay rent', { dueDate: '2026-11-18' }, 3),
];

describe('dueDays', () => {
  it('lists the distinct days open to-dos are due, earliest first', () => {
    expect(dueDays([...phone, todo('Also today', { dueDate: '2026-11-20' })])).toEqual([
      '2026-11-18',
      '2026-11-20',
      '2026-11-24',
    ]);
  });

  it('skips undated, done, deleted, habits and bad dates', () => {
    expect(
      dueDays([
        todo('Old task', { dueDate: '2026-11-19', completedAt: 1 }),
        todo('Gone', { dueDate: '2026-11-21', archivedAt: 1 }),
        todo('Walk', { type: 'daily', dueDate: '2026-11-22' }),
        todo('Broken', { dueDate: 'soon' }),
        todo('No date'),
      ]),
    ).toEqual([]);
  });

  it('keeps the earliest 400 of 500 days', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      todo(`T${i}`, { dueDate: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10) }),
    );
    const days = dueDays(many);
    expect(days).toHaveLength(MAX_DUE_DAYS);
    expect(days[0]).toBe('2026-01-01');
    expect(days.at(-1)).toBe(new Date(Date.UTC(2026, 0, 400)).toISOString().slice(0, 10));
  });
});

describe('dueSummary', () => {
  it('counts what is due, overdue first, and names them', () => {
    expect(dueSummary(phone, TODAY)).toEqual({
      title: '2 to-dos due today (1 overdue)',
      body: 'Pay rent, Send term sheet',
    });
  });

  it('says 1 to-do without overdue', () => {
    expect(dueSummary([todo('Send term sheet', { dueDate: TODAY })], TODAY)).toEqual({
      title: '1 to-do due today',
      body: 'Send term sheet',
    });
  });

  it('names three and counts the rest, same-day ones in list order', () => {
    const five = ['E', 'D', 'C', 'B', 'A'].map((t, i) => todo(t, { dueDate: TODAY }, 4 - i));
    expect(dueSummary(five, TODAY).body).toBe('A, B, C and 2 more');
  });

  it('carries an unfinished to-do into the next morning as overdue', () => {
    expect(dueSummary(phone, '2026-11-21').title).toBe('2 to-dos due today (2 overdue)');
  });

  it('is all caught up when everything was done', () => {
    expect(dueSummary([todo('Done', { dueDate: TODAY, completedAt: 5 })], TODAY)).toEqual({
      title: 'All caught up',
      body: 'Nothing is due today.',
    });
  });

  it('works through 2,000 to-dos quickly', () => {
    const many = Array.from({ length: 2000 }, (_, i) => todo(`T${i}`, { dueDate: `2026-11-${10 + (i % 20)}` }, i));
    const started = performance.now();
    const note = dueSummary(many, TODAY);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(note.title).toBe('1100 to-dos due today (1000 overdue)');
  });
});

describe('arrivalsNote', () => {
  it('names the new to-dos', () => {
    expect(arrivalsNote({ kind: 'arrivals', count: 2, titles: ['Call KeyBank', 'Send the memo'] })).toEqual({
      title: '2 new to-dos from your assistant',
      body: 'Call KeyBank, Send the memo',
    });
  });

  it('counts those it was not told the names of', () => {
    expect(arrivalsNote({ kind: 'arrivals', count: 5, titles: ['A', 'B', 'C'] }).body).toBe('A, B, C and 2 more');
  });

  it('says to open the app when no titles came', () => {
    expect(arrivalsNote({ kind: 'arrivals', count: 1, titles: [] })).toEqual({
      title: '1 new to-do from your assistant',
      body: 'Open Habit Tracker to see them.',
    });
  });
});

describe('parsePush', () => {
  it('reads a due push', () => {
    expect(parsePush({ kind: 'due', day: TODAY })).toEqual({ kind: 'due', day: TODAY });
  });

  it('reads an arrivals push, cleaning and capping titles', () => {
    expect(
      parsePush({
        kind: 'arrivals',
        count: 4,
        titles: ['  Call\nKeyBank ', 'x'.repeat(80), 7, '', 'Fourth', 'Fifth'],
      }),
    ).toEqual({ kind: 'arrivals', count: 4, titles: ['Call KeyBank', 'x'.repeat(60), 'Fourth'] });
    expect(parsePush({ kind: 'arrivals', count: 1 })).toEqual({ kind: 'arrivals', count: 1, titles: [] });
  });

  it('keeps markup as plain characters', () => {
    const message = parsePush({ kind: 'arrivals', count: 1, titles: ['<img src=x onerror=alert(1)>'] });
    expect(message).toEqual({ kind: 'arrivals', count: 1, titles: ['<img src=x onerror=alert(1)>'] });
  });

  it('refuses anything else', () => {
    for (const bad of [
      null,
      'due',
      {},
      { kind: 'due' },
      { kind: 'due', day: 'today' },
      { kind: 'arrivals' },
      { kind: 'arrivals', count: 0 },
      { kind: 'arrivals', count: 1.5 },
      { kind: 'arrivals', count: 1000 },
      { kind: 'other' },
    ]) {
      expect(parsePush(bad)).toBeNull();
    }
  });

  it('has a fallback for unreadable pushes', () => {
    expect(FALLBACK_NOTE).toEqual({ title: 'Habit Tracker', body: "Open the app to see what's new." });
  });
});
