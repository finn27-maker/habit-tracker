import { describe, expect, it } from 'vitest';
import type { Item } from './items';
import type { List } from './lists';
import { parseBackup } from './backup';
import { moveTodo } from './order';
import { buildListView, buildToday, buildUpcoming } from './today';

const today = '2026-10-14';
const list = (manualTodoOrder?: boolean): List => ({
  id: 'biz',
  name: 'Biz Lending Strategy',
  emoji: '💼',
  color: 'blue',
  order: 0,
  ...(manualTodoOrder ? { manualTodoOrder } : {}),
});
const todo = (id: string, order: number, extra: Partial<Item> = {}): Item => ({
  id,
  listId: 'biz',
  type: 'todo',
  title: id,
  order,
  ...extra,
});
// By date: Send (today), Call (Oct 20), Deck (no date). By creation order: Deck, Send, Call.
const items = (): Item[] => [
  todo('Deck', 0),
  todo('Send', 1, { dueDate: '2026-10-14' }),
  todo('Call', 2, { dueDate: '2026-10-20' }),
];

const apply = (all: Item[], changed: Item[]) => all.map((item) => changed.find((c) => c.id === item.id) ?? item);
const pageTitles = (all: Item[], manual: boolean) =>
  buildListView({ list: list(manual), items: all, completionDays: {}, targets: {}, today }).rows.map(
    (row) => row.item.id,
  );

describe('moveTodo', () => {
  it('starts a never-reordered list from the date order on screen', () => {
    const all = items();
    expect(pageTitles(all, false)).toEqual(['Send', 'Call', 'Deck']);
    const changed = moveTodo(all, 'Call', 2, false);
    expect(pageTitles(apply(all, changed), true)).toEqual(['Send', 'Deck', 'Call']);
  });

  it('numbers every open to-do on the first move', () => {
    expect(moveTodo(items(), 'Deck', 0, false).map((item) => [item.id, item.order])).toEqual([
      ['Deck', 0],
      ['Send', 1],
      ['Call', 2],
    ]);
  });

  it('then changes only the moved to-do, placing it between its neighbours', () => {
    let all = apply(items(), moveTodo(items(), 'Deck', 0, false)); // Deck 0, Send 1, Call 2
    const changed = moveTodo(all, 'Call', 1, true);
    expect(changed).toEqual([expect.objectContaining({ id: 'Call', order: 0.5 })]);
    all = apply(all, changed);
    expect(pageTitles(all, true)).toEqual(['Deck', 'Call', 'Send']);
  });

  it('moves to the very top and bottom', () => {
    const all = apply(items(), moveTodo(items(), 'Deck', 0, false));
    expect(moveTodo(all, 'Call', 0, true)).toEqual([expect.objectContaining({ id: 'Call', order: -1 })]);
    expect(moveTodo(all, 'Deck', 2, true)).toEqual([expect.objectContaining({ id: 'Deck', order: 3 })]);
  });

  it('handles a list with just one open to-do', () => {
    expect(moveTodo([todo('Only', 7)], 'Only', 0, true)).toEqual([expect.objectContaining({ id: 'Only', order: -1 })]);
  });

  it('clamps a place past either end', () => {
    const all = apply(items(), moveTodo(items(), 'Deck', 0, false));
    expect(pageTitles(apply(all, moveTodo(all, 'Send', 99, true)), true)).toEqual(['Deck', 'Call', 'Send']);
    expect(pageTitles(apply(all, moveTodo(all, 'Call', -5, true)), true)).toEqual(['Call', 'Deck', 'Send']);
  });

  it('numbers them all again when halving runs out of room', () => {
    const all = [todo('A', 1), todo('B', 1 + Number.EPSILON), todo('C', 3)];
    const changed = moveTodo(all, 'C', 1, true);
    expect(changed.map((item) => [item.id, item.order])).toEqual([
      ['A', 0],
      ['C', 1],
      ['B', 2],
    ]);
  });

  it('ignores completed to-dos, habits and unknown ids', () => {
    const all = [...items(), todo('Done', 5, { completedAt: 1 }), { ...todo('Read', 9), type: 'daily' as const }];
    expect(moveTodo(all, 'Done', 0, true)).toEqual([]);
    expect(moveTodo(all, 'Read', 0, true)).toEqual([]);
    expect(moveTodo(all, 'nope', 0, true)).toEqual([]);
    expect(moveTodo(all, 'Deck', 0, false).map((item) => item.id)).toEqual(['Deck', 'Send', 'Call']);
  });

  it('lets a reopened to-do come back at its old place', () => {
    let all = apply(items(), moveTodo(items(), 'Deck', 0, false)); // Deck, Send, Call
    all = all.map((item) => (item.id === 'Send' ? { ...item, completedAt: 1 } : item));
    all = apply(all, moveTodo(all, 'Call', 0, true)); // Call, Deck (Send is finished)
    all = all.map((item) => (item.id === 'Send' ? { ...item, completedAt: undefined } : item));
    expect(pageTitles(all, true)).toEqual(['Call', 'Deck', 'Send']);
  });

  it('moves one of 300 to-dos quickly', () => {
    const all = Array.from({ length: 300 }, (_, i) => todo(`t${i}`, i));
    const started = performance.now();
    const changed = moveTodo(all, 't299', 0, true);
    expect(performance.now() - started).toBeLessThan(100);
    expect(changed).toEqual([expect.objectContaining({ id: 't299', order: -1 })]);
  });
});

describe('the list setting in backups', () => {
  const file = (extra: Record<string, unknown>) =>
    JSON.stringify({
      app: 'habit-tracker',
      version: 1,
      exportedAt: '2026-11-14T00:00:00.000Z',
      data: {
        lists: [{ id: 'l1', name: 'Work', emoji: '💼', color: 'blue', order: 0, ...extra }],
        items: [],
        completions: [],
        targetHistory: [],
      },
    });

  it('restores a list that keeps its own to-do order', () => {
    expect(parseBackup(file({ manualTodoOrder: true }))).toMatchObject({
      ok: true,
      value: { data: { lists: [{ manualTodoOrder: true }] } },
    });
  });

  it('restores an older backup in date order and refuses a damaged setting', () => {
    const older = parseBackup(file({}));
    expect(older.ok && older.value.data.lists[0]).not.toHaveProperty('manualTodoOrder');
    expect(parseBackup(file({ manualTodoOrder: 'yes' })).ok).toBe(false);
  });
});

describe('where the order applies', () => {
  const reordered = () => apply(items(), moveTodo(items(), 'Deck', 0, false)); // Deck, Send, Call

  it('a list page keeps date order until the list is reordered', () => {
    expect(pageTitles(reordered(), false)).toEqual(['Send', 'Call', 'Deck']);
    expect(pageTitles(reordered(), true)).toEqual(['Deck', 'Send', 'Call']);
  });

  it('Today keeps date order in a reordered list', () => {
    const [group] = buildToday({ lists: [list(true)], items: reordered(), completionDays: {}, targets: {}, today });
    expect(group!.rows.map((row) => row.item.id)).toEqual(['Send', 'Deck']);
  });

  it('Upcoming keeps its date sections in a reordered list', () => {
    const sections = buildUpcoming({ lists: [list(true)], items: reordered(), completionDays: {}, targets: {}, today });
    expect(sections.map((section) => [section.title, section.rows.map((row) => row.item.id)])).toEqual([
      ['Today', ['Send']],
      ['This week', ['Call']],
      ['No date', ['Deck']],
    ]);
  });

  it('habits and goals stay above to-dos in their own order', () => {
    const all = [...reordered(), { ...todo('Read', 5), type: 'daily' as const }, { ...todo('Ride', 4), type: 'weekly' as const }];
    expect(pageTitles(all, true)).toEqual(['Ride', 'Read', 'Deck', 'Send', 'Call']);
  });

  it('a changed due date does not move a to-do in a reordered list', () => {
    const all = reordered().map((item) => (item.id === 'Deck' ? { ...item, dueDate: '2026-10-30' } : item));
    expect(pageTitles(all, true)).toEqual(['Deck', 'Send', 'Call']);
  });
});
