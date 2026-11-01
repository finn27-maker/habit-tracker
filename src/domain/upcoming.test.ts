import { describe, expect, it } from 'vitest';
import { addDaysToKey } from './dates';
import type { Item } from './items';
import type { List } from './lists';
import { fastestOf } from '../testing/timing';
import { buildUpcoming, type UpcomingSection } from './today';

const list = (id: string, name: string, emoji: string, order: number): List => ({
  id,
  name,
  emoji,
  color: 'teal',
  order,
});
const todo = (id: string, listId: string, extra: Partial<Item> = {}): Item => ({
  id,
  listId,
  type: 'todo',
  title: id,
  order: 0,
  ...extra,
});

// Sunday 2026-11-01.
const today = '2026-11-01';
const health = list('health', 'Health', '💪', 0);
const home = list('home', 'Home', '🏡', 1);
const work = list('work', 'Work', '💼', 2);
const lists = [health, home, work];

const build = (items: Item[], lingering?: ReadonlySet<string>) =>
  buildUpcoming({ lists, items, completionDays: {}, targets: {}, today, lingering });

const shape = (sections: UpcomingSection[]) =>
  sections.map((section) => [section.title, section.rows.map((row) => row.item.id)]);

describe('buildUpcoming', () => {
  it('puts open to-dos from every list into date sections, in order', () => {
    const sections = build([
      todo('Buy light bulbs', 'home'),
      todo('Plan holiday', 'home', { dueDate: '2026-11-20' }),
      todo('Send report', 'work', { dueDate: '2026-11-05' }),
      todo('Book physio', 'health', { dueDate: '2026-11-02' }),
      todo('Pay the plumber', 'home', { dueDate: '2026-11-01' }),
      todo('Renew licence', 'work', { dueDate: '2026-10-29' }),
    ]);
    expect(shape(sections)).toEqual([
      ['Overdue', ['Renew licence']],
      ['Today', ['Pay the plumber']],
      ['Tomorrow', ['Book physio']],
      ['This week', ['Send report']],
      ['Later', ['Plan holiday']],
      ['No date', ['Buy light bulbs']],
    ]);
    expect(sections.map((section) => section.key)).toEqual([
      'overdue',
      'today',
      'tomorrow',
      'week',
      'later',
      'none',
    ]);
  });

  it('gives each row its list, due label and note', () => {
    const [section] = build([
      todo('Send report', 'work', { dueDate: '2026-11-05', note: 'Q3 numbers' }),
    ]);
    const row = section!.rows[0]!;
    expect(row.list).toBe(work);
    expect(row.due).toEqual({ text: 'Thu', overdue: false });
    expect(row.item.note).toBe('Q3 numbers');
    expect(row.done).toBe(false);
  });

  it('sorts by due date across lists, then saved order', () => {
    const sections = build([
      todo('Send report', 'work', { dueDate: '2026-11-05' }),
      todo('Call vet', 'home', { dueDate: '2026-11-03' }),
      todo('Second', 'health', { dueDate: '2026-11-03', order: 2 }),
    ]);
    expect(shape(sections)).toEqual([['This week', ['Call vet', 'Second', 'Send report']]]);
  });

  it('counts six days ahead as This week and seven as Later', () => {
    const sections = build([
      todo('Six', 'home', { dueDate: '2026-11-07' }),
      todo('Seven', 'home', { dueDate: '2026-11-08' }),
    ]);
    expect(shape(sections)).toEqual([
      ['This week', ['Six']],
      ['Later', ['Seven']],
    ]);
  });

  it('leaves out habits, goals, finished to-dos and to-dos whose list is gone', () => {
    const sections = build([
      { ...todo('Stretch', 'health'), type: 'daily' },
      { ...todo('Peloton ride', 'health'), type: 'weekly' },
      todo('Old task', 'home', { completedAt: 5 }),
      todo('Orphan', 'deleted-list'),
    ]);
    expect(sections).toEqual([]);
  });

  it('keeps a just-ticked to-do in place, checked', () => {
    const sections = build(
      [todo('Book physio', 'health', { dueDate: '2026-11-02', completedAt: 5 })],
      new Set(['Book physio']),
    );
    expect(shape(sections)).toEqual([['Tomorrow', ['Book physio']]]);
    expect(sections[0]!.rows[0]!.done).toBe(true);
  });

  it('groups 5,000 to-dos quickly', () => {
    const items = Array.from({ length: 5000 }, (_, i) =>
      todo(`t${i}`, lists[i % 3]!.id, {
        order: i,
        ...(i % 7 === 0 ? {} : { dueDate: addDaysToKey(today, (i % 40) - 10) }),
      }),
    );
    const ms = fastestOf(5, () => build(items));
    expect(build(items).reduce((sum, section) => sum + section.rows.length, 0)).toBe(5000);
    expect(ms).toBeLessThan(250);
  });
});
