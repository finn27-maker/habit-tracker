import { describe, expect, it } from 'vitest';
import { addDaysToKey } from './dates';
import type { Item } from './items';
import type { List } from './lists';
import { fastestOf } from '../testing/timing';
import {
  buildListView,
  buildToday,
  type DailyRow,
  type TodayGroup,
  type TodayRow,
  type TodoRow,
  type WeeklyRow,
} from './today';

const list = (id: string, name: string, order: number): List => ({
  id,
  name,
  emoji: '📚',
  color: 'teal',
  order,
});
const habit = (id: string, listId: string, order: number, title = id): Item => ({
  id,
  listId,
  type: 'daily',
  title,
  order,
});
const goal = (id: string, listId: string, order: number, title = id): Item => ({
  ...habit(id, listId, order, title),
  type: 'weekly',
});
const todo = (id: string, listId: string, order: number, extra: Partial<Item> = {}): Item => ({
  ...habit(id, listId, order),
  type: 'todo',
  ...extra,
});

// 2026-10-14 is a Wednesday, in the week that started on Sunday 2026-10-11.
const today = '2026-10-14';
const fitness = list('fit', 'Fitness', 0);
const work = list('work', 'Work', 1);
const personal = list('me', 'Personal', 2);

const asDaily = (row: TodayRow) => {
  expect(row.kind).toBe('daily');
  return row as DailyRow;
};
const asWeekly = (row: TodayRow) => {
  expect(row.kind).toBe('weekly');
  return row as WeeklyRow;
};
const asTodo = (row: TodayRow) => {
  expect(row.kind).toBe('todo');
  return row as TodoRow;
};

describe('buildListView', () => {
  const items: Item[] = [
    habit('meditate', 'me', 0),
    goal('read', 'me', 1),
    todo('flights', 'me', 2, { dueDate: '2026-10-20' }),
    todo('garage', 'me', 3),
    todo('overdue', 'me', 4, { dueDate: '2026-10-10' }),
    todo('done-old', 'me', 5, { completedAt: 10 }),
    todo('done-new', 'me', 6, { completedAt: 20 }),
    todo('lingering', 'me', 7, { completedAt: 30 }),
    todo('other-list', 'fit', 0),
  ];
  const view = buildListView({
    list: personal,
    items,
    completionDays: {},
    targets: { read: [{ effectiveWeekStart: '2026-10-11', target: 2 }] },
    today,
    lingering: new Set(['lingering']),
  });

  it('shows habits and goals, then every open to-do in due order including future ones', () => {
    expect(view.rows.map((r) => r.item.id)).toEqual([
      'meditate',
      'read',
      'overdue',
      'flights',
      'garage',
      'lingering',
    ]);
    expect(asTodo(view.rows[3]!).due).toEqual({ text: 'Tue', overdue: false });
  });

  it('keeps a lingering to-do in the open rows, checked', () => {
    expect(asTodo(view.rows.find((r) => r.item.id === 'lingering')!).done).toBe(true);
  });

  it('lists completed to-dos most recent first, without the lingering one', () => {
    expect(view.completed.map((r) => [r.item.id, r.done])).toEqual([
      ['done-new', true],
      ['done-old', true],
    ]);
  });

  it('ignores other lists and handles an empty list', () => {
    const empty = buildListView({
      list: work,
      items,
      completionDays: {},
      targets: {},
      today,
    });
    expect(empty).toEqual({ rows: [], completed: [] });
  });
});

describe('buildToday', () => {
  it('returns nothing when there are no habits', () => {
    expect(
      buildToday({ lists: [fitness], items: [], completionDays: {}, targets: {}, today }),
    ).toEqual([]);
  });

  it('groups habits by list in list order and skips lists without habits', () => {
    const groups = buildToday({
      lists: [personal, fitness, work],
      items: [habit('a', 'work', 0), habit('b', 'fit', 0)],
      completionDays: {},
      targets: {},
      today,
    });
    expect(groups.map((g) => g.list.name)).toEqual(['Fitness', 'Work']);
    expect(groups[0]!.rows.map((r) => r.item.id)).toEqual(['b']);
    expect(groups[1]!.rows.map((r) => r.item.id)).toEqual(['a']);
  });

  it('orders habits within a list by their order', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [habit('third', 'fit', 2), habit('first', 'fit', 0), habit('second', 'fit', 1)],
      completionDays: {},
      targets: {},
      today,
    });
    expect(groups[0]!.rows.map((r) => r.item.id)).toEqual(['first', 'second', 'third']);
  });

  it('attaches streak, done-today and at-risk to each daily row', () => {
    const yesterday = addDaysToKey(today, -1);
    const groups = buildToday({
      lists: [fitness],
      items: [habit('done', 'fit', 0), habit('risk', 'fit', 1), habit('fresh', 'fit', 2)],
      completionDays: { done: [yesterday, today], risk: [yesterday] },
      targets: {},
      today,
    });
    const rows = groups[0]!.rows.map(asDaily);
    expect(rows.map((r) => [r.item.id, r.streak, r.doneToday, r.atRisk])).toEqual([
      ['done', 2, true, false],
      ['risk', 1, false, true],
      ['fresh', 0, false, false],
    ]);
  });

  it('shows weekly goals beside daily habits, in their saved order', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [goal('ride', 'fit', 1), habit('stretch', 'fit', 0)],
      completionDays: {},
      targets: { ride: [{ effectiveWeekStart: '2026-10-11', target: 3 }] },
      today,
    });
    expect(groups[0]!.rows.map((r) => [r.kind, r.item.id])).toEqual([
      ['daily', 'stretch'],
      ['weekly', 'ride'],
    ]);
  });

  it('attaches this week\'s count, target, met state and streak to a weekly row', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [goal('ride', 'fit', 0)],
      completionDays: {
        ride: ['2026-09-27', '2026-09-28', '2026-09-29', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-11'],
      },
      targets: { ride: [{ effectiveWeekStart: '2026-09-27', target: 3 }] },
      today,
    });
    expect(asWeekly(groups[0]!.rows[0]!)).toMatchObject({
      count: 1,
      target: 3,
      met: false,
      streak: 2,
      streakAtRisk: true,
    });
  });

  it('shows a weekly goal even when nothing has been logged yet', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [goal('ride', 'fit', 0)],
      completionDays: {},
      targets: { ride: [{ effectiveWeekStart: '2026-10-11', target: 4 }] },
      today,
    });
    expect(asWeekly(groups[0]!.rows[0]!)).toMatchObject({ count: 0, target: 4, streak: 0 });
  });

  it('treats a weekly goal with no target records as once a week', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [goal('ride', 'fit', 0)],
      completionDays: {},
      targets: {},
      today,
    });
    expect(asWeekly(groups[0]!.rows[0]!)).toMatchObject({ count: 0, target: 1, streak: 0 });
  });

  it('shows to-dos due today, overdue or undated after the habits, earliest due first', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [
        todo('undated', 'fit', 0),
        habit('keep', 'fit', 5),
        todo('due-today', 'fit', 1, { dueDate: today }),
        todo('overdue', 'fit', 2, { dueDate: '2026-10-12' }),
        todo('future', 'fit', 3, { dueDate: '2026-10-20' }),
        todo('done', 'fit', 4, { completedAt: 1 }),
      ],
      completionDays: {},
      targets: {},
      today,
    });
    expect(groups[0]!.rows.map((r) => r.item.id)).toEqual([
      'keep',
      'overdue',
      'due-today',
      'undated',
    ]);
    expect(asTodo(groups[0]!.rows[1]!)).toMatchObject({
      done: false,
      due: { text: '2 days overdue', overdue: true },
    });
    expect(asTodo(groups[0]!.rows[3]!).due).toBeUndefined();
  });

  it('keeps a just-completed to-do on Today, checked, while it lingers', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [todo('done', 'fit', 0, { completedAt: 1 }), todo('old', 'fit', 1, { completedAt: 2 })],
      completionDays: {},
      targets: {},
      today,
      lingering: new Set(['done']),
    });
    expect(groups[0]!.rows.map((r) => [r.item.id, asTodo(r).done])).toEqual([['done', true]]);
  });

  it('shows a list that only has to-dos', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [todo('task', 'fit', 0)],
      completionDays: {},
      targets: {},
      today,
    });
    expect(groups.map((g) => g.list.name)).toEqual(['Fitness']);
  });

  it('computes 200 to-dos across lists in well under 50 ms', () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      todo(`t${i}`, i % 2 ? 'fit' : 'work', i, i % 3 ? { dueDate: addDaysToKey(today, -i) } : {}),
    );
    const elapsed = fastestOf(5, () =>
      buildToday({ lists: [fitness, work], items, completionDays: {}, targets: {}, today }),
    );
    expect(elapsed).toBeLessThan(50);
  });

  it('ignores habits whose list no longer exists', () => {
    expect(
      buildToday({
        lists: [fitness],
        items: [habit('x', 'gone', 0)],
        completionDays: {},
        targets: {},
        today,
      }),
    ).toEqual([]);
  });

  it('computes fifty habits with a year of history in well under 50 ms', () => {
    const days = Array.from({ length: 365 }, (_, i) => addDaysToKey(today, -i));
    const items = Array.from({ length: 50 }, (_, i) => habit(`h${i}`, 'fit', i));
    const completionDays = Object.fromEntries(items.map((item) => [item.id, days]));

    let groups: TodayGroup[] = [];
    const elapsed = fastestOf(5, () => {
      groups = buildToday({ lists: [fitness], items, completionDays, targets: {}, today });
    });

    expect(groups[0]!.rows).toHaveLength(50);
    expect(asDaily(groups[0]!.rows[0]!).streak).toBe(365);
    expect(elapsed).toBeLessThan(50);
  });

  it('computes fifty weekly goals with a year of history in well under 50 ms', () => {
    const weeks = Array.from({ length: 52 }, (_, i) => addDaysToKey('2025-10-12', i * 7));
    const items = Array.from({ length: 50 }, (_, i) => goal(`g${i}`, 'fit', i));
    const completionDays = Object.fromEntries(items.map((item) => [item.id, weeks]));
    const targets = Object.fromEntries(
      items.map((item) => [
        item.id,
        [
          { effectiveWeekStart: '2025-10-12', target: 1 },
          { effectiveWeekStart: '2026-03-01', target: 1 },
        ],
      ]),
    );

    let groups: TodayGroup[] = [];
    const elapsed = fastestOf(5, () => {
      groups = buildToday({ lists: [fitness], items, completionDays, targets, today });
    });

    expect(groups[0]!.rows).toHaveLength(50);
    expect(asWeekly(groups[0]!.rows[0]!).streak).toBe(52);
    expect(elapsed).toBeLessThan(50);
  });
});
