import { describe, expect, it } from 'vitest';
import type { Item } from './items';
import { compareCompleted, compareTodos, dueLabel, isOnToday } from './todos';

const today = '2026-10-14'; // a Wednesday

const todo = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  listId: 'list-1',
  type: 'todo',
  title: id,
  order: 0,
  ...extra,
});

describe('dueLabel', () => {
  it.each([
    ['2026-10-14', 'Today', false],
    ['2026-10-15', 'Tomorrow', false],
    ['2026-10-16', 'Fri', false],
    ['2026-10-20', 'Tue', false],
    ['2026-10-21', 'Oct 21', false],
    ['2026-12-31', 'Dec 31', false],
    ['2027-01-05', 'Jan 5, 2027', false],
    ['2026-10-13', '1 day overdue', true],
    ['2026-10-11', '3 days overdue', true],
    ['2025-10-14', '365 days overdue', true],
  ])('a to-do due %s reads "%s"', (due, text, overdue) => {
    expect(dueLabel(due, today)).toEqual({ text, overdue });
  });

  it('counts calendar days across daylight saving', () => {
    expect(dueLabel('2026-11-02', '2026-10-31')).toEqual({ text: 'Mon', overdue: false });
    expect(dueLabel('2026-03-07', '2026-03-09')).toEqual({ text: '2 days overdue', overdue: true });
  });
});

describe('isOnToday', () => {
  it.each([
    ['undated', todo('a'), true],
    ['due today', todo('a', { dueDate: '2026-10-14' }), true],
    ['overdue', todo('a', { dueDate: '2026-10-01' }), true],
    ['due tomorrow', todo('a', { dueDate: '2026-10-15' }), false],
    ['completed', todo('a', { completedAt: 1 }), false],
    ['completed and overdue', todo('a', { dueDate: '2026-10-01', completedAt: 1 }), false],
  ])('an open to-do that is %s: %s', (_label, item, expected) => {
    expect(isOnToday(item, today)).toBe(expected);
  });
});

describe('compareTodos', () => {
  it('puts the earliest due date first, undated last, and breaks ties by saved order', () => {
    const items = [
      todo('undated-2', { order: 2 }),
      todo('today', { dueDate: '2026-10-14', order: 5 }),
      todo('undated-1', { order: 1 }),
      todo('old', { dueDate: '2026-10-09', order: 9 }),
      todo('older-tie-b', { dueDate: '2026-10-12', order: 4 }),
      todo('older-tie-a', { dueDate: '2026-10-12', order: 3 }),
      todo('future', { dueDate: '2026-10-20', order: 0 }),
    ];
    expect([...items].sort(compareTodos).map((t) => t.id)).toEqual([
      'old',
      'older-tie-a',
      'older-tie-b',
      'today',
      'future',
      'undated-1',
      'undated-2',
    ]);
  });
});

describe('compareCompleted', () => {
  it('lists the most recently completed first', () => {
    const items = [
      todo('first', { completedAt: 1 }),
      todo('third', { completedAt: 3 }),
      todo('second', { completedAt: 2 }),
    ];
    expect([...items].sort(compareCompleted).map((t) => t.id)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });

  it('puts a to-do with no completion time last', () => {
    const items = [todo('open'), todo('done', { completedAt: 5 }), todo('also-open')];
    expect([...items].sort(compareCompleted).map((t) => t.id)).toEqual([
      'done',
      'open',
      'also-open',
    ]);
  });
});
