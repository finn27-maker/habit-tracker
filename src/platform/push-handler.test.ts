import { describe, expect, it } from 'vitest';
import type { NotifyTodo } from '../domain/notify';
import { notificationFor, openToday, pushData } from './push-handler';

const todos: NotifyTodo[] = [
  { type: 'todo', title: 'Pay rent', order: 0, dueDate: '2026-11-18' },
  { type: 'todo', title: 'Send term sheet', order: 1, dueDate: '2026-11-20' },
  { type: 'todo', title: 'Call the bank', order: 2, dueDate: '2026-11-24' },
];
const load = async () => todos;
const TODAY = 'https://finn27-maker.github.io/habit-tracker/#/today';

describe('notificationFor', () => {
  it('writes the morning summary from the phone’s own to-dos', async () => {
    expect(await notificationFor({ kind: 'due', day: '2026-11-20' }, load)).toEqual({
      title: '2 to-dos due today (1 overdue)',
      body: 'Pay rent, Send term sheet',
      tag: 'due-summary',
    });
  });

  it('announces assistant arrivals', async () => {
    expect(await notificationFor({ kind: 'arrivals', count: 1, titles: ['Call KeyBank'] }, load)).toEqual({
      title: '1 new to-do from your assistant',
      body: 'Call KeyBank',
      tag: 'arrivals',
    });
  });

  it('still shows something for an unreadable push or unreadable storage', async () => {
    expect(await notificationFor(null, load)).toEqual({
      title: 'Habit Tracker',
      body: "Open the app to see what's new.",
      tag: 'habit-tracker',
    });
    const broken = async () => Promise.reject(new Error('IDB gone'));
    expect(await notificationFor({ kind: 'due', day: '2026-11-20' }, broken)).toMatchObject({
      title: 'Habit Tracker',
      tag: 'due-summary',
    });
  });
});

describe('pushData', () => {
  it('reads JSON, or null for no body or bad JSON', () => {
    expect(pushData({ data: { json: () => ({ kind: 'due' }) } })).toEqual({ kind: 'due' });
    expect(pushData({ data: null })).toBeNull();
    expect(
      pushData({
        data: {
          json: () => {
            throw new SyntaxError('bad');
          },
        },
      }),
    ).toBeNull();
  });
});

describe('openToday', () => {
  function windows(open: { url: string }[]) {
    const log: string[] = [];
    return {
      log,
      clients: {
        matchAll: async () =>
          open.map((w) => ({
            url: w.url,
            focus: async () => log.push('focus'),
            navigate: async (url: string) => log.push(`navigate ${url}`),
          })),
        openWindow: async (url: string) => log.push(`open ${url}`),
      },
    };
  }

  it('opens the app on Today when it is closed', async () => {
    const w = windows([]);
    await openToday(TODAY, w.clients);
    expect(w.log).toEqual([`open ${TODAY}`]);
  });

  it('brings an open app forward and moves it to Today', async () => {
    const w = windows([{ url: 'https://finn27-maker.github.io/habit-tracker/#/lists' }]);
    await openToday(TODAY, w.clients);
    expect(w.log).toEqual(['focus', `navigate ${TODAY}`]);

    const already = windows([{ url: TODAY }]);
    await openToday(TODAY, already.clients);
    expect(already.log).toEqual(['focus']);
  });
});
