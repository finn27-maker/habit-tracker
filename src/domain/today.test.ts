import { describe, expect, it } from 'vitest';
import { addDaysToKey } from './dates';
import type { Item } from './items';
import type { List } from './lists';
import { buildToday } from './today';

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

const today = '2026-10-14';
const fitness = list('fit', 'Fitness', 0);
const work = list('work', 'Work', 1);
const personal = list('me', 'Personal', 2);

describe('buildToday', () => {
  it('returns nothing when there are no habits', () => {
    expect(buildToday({ lists: [fitness], items: [], completionDays: {}, today })).toEqual([]);
  });

  it('groups habits by list in list order and skips lists without habits', () => {
    const groups = buildToday({
      lists: [personal, fitness, work],
      items: [habit('a', 'work', 0), habit('b', 'fit', 0)],
      completionDays: {},
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
      today,
    });
    expect(groups[0]!.rows.map((r) => r.item.id)).toEqual(['first', 'second', 'third']);
  });

  it('attaches streak, done-today and at-risk to each row', () => {
    const yesterday = addDaysToKey(today, -1);
    const groups = buildToday({
      lists: [fitness],
      items: [habit('done', 'fit', 0), habit('risk', 'fit', 1), habit('fresh', 'fit', 2)],
      completionDays: { done: [yesterday, today], risk: [yesterday] },
      today,
    });
    expect(groups[0]!.rows.map((r) => [r.item.id, r.streak, r.doneToday, r.atRisk])).toEqual([
      ['done', 2, true, false],
      ['risk', 1, false, true],
      ['fresh', 0, false, false],
    ]);
  });

  it('only shows daily habits for now', () => {
    const groups = buildToday({
      lists: [fitness],
      items: [habit('keep', 'fit', 0), { ...habit('goal', 'fit', 1), type: 'weekly' }],
      completionDays: {},
      today,
    });
    expect(groups[0]!.rows.map((r) => r.item.id)).toEqual(['keep']);
  });

  it('ignores habits whose list no longer exists', () => {
    expect(
      buildToday({ lists: [fitness], items: [habit('x', 'gone', 0)], completionDays: {}, today }),
    ).toEqual([]);
  });

  it('computes fifty habits with a year of history in well under 50 ms', () => {
    const days = Array.from({ length: 365 }, (_, i) => addDaysToKey(today, -i));
    const items = Array.from({ length: 50 }, (_, i) => habit(`h${i}`, 'fit', i));
    const completionDays = Object.fromEntries(items.map((item) => [item.id, days]));

    const start = performance.now();
    const groups = buildToday({ lists: [fitness], items, completionDays, today });
    const elapsed = performance.now() - start;

    expect(groups[0]!.rows).toHaveLength(50);
    expect(groups[0]!.rows[0]!.streak).toBe(365);
    expect(elapsed).toBeLessThan(50);
  });
});
