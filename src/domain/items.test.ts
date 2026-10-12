import { describe, expect, it } from 'vitest';
import {
  ITEM_KINDS,
  ITEM_TYPES,
  MAX_ITEM_TITLE,
  MAX_TARGET,
  MIN_TARGET,
  kindTitle,
  validateItemInput,
} from './items';

describe('item kinds', () => {
  it('names and explains every type, to-do first', () => {
    expect([...ITEM_KINDS.map((kind) => kind.type)].sort()).toEqual([...ITEM_TYPES].sort());
    expect(ITEM_KINDS.map((kind) => [kind.title, kind.description])).toEqual([
      ['To-do', 'Once, with an optional due date'],
      ['Daily habit', 'Every day, with a streak'],
      ['Weekly goal', 'A number of times each week'],
    ]);
    expect(kindTitle('weekly')).toBe('Weekly goal');
  });
});

const valid = { title: 'Meditate', listId: 'list-1', type: 'daily' };

describe('validateItemInput', () => {
  it('accepts a valid habit and trims the title', () => {
    expect(validateItemInput({ ...valid, title: '   Meditate   ' })).toEqual({
      ok: true,
      value: valid,
    });
  });

  it.each(['', '   '])('rejects the blank title %j', (title) => {
    expect(validateItemInput({ ...valid, title })).toEqual({
      ok: false,
      error: "Name can't be empty",
    });
  });

  it('allows the longest title and rejects one more character', () => {
    expect(validateItemInput({ ...valid, title: 'a'.repeat(MAX_ITEM_TITLE) }).ok).toBe(true);
    expect(validateItemInput({ ...valid, title: 'a'.repeat(MAX_ITEM_TITLE + 1) })).toEqual({
      ok: false,
      error: 'Name must be 60 characters or fewer',
    });
    expect(MAX_ITEM_TITLE).toBe(60);
  });

  it('requires a list', () => {
    expect(validateItemInput({ ...valid, listId: '' })).toEqual({
      ok: false,
      error: 'Pick a list',
    });
  });

  it('only accepts the known item types', () => {
    expect(ITEM_TYPES).toEqual(['daily', 'weekly', 'todo']);
    // Weekly goals also need a target; the other types ignore it.
    for (const type of ITEM_TYPES) {
      expect(validateItemInput({ ...valid, type, target: 3 }).ok).toBe(true);
    }
    expect(validateItemInput({ ...valid, type: 'monthly' })).toEqual({
      ok: false,
      error: 'Pick daily, weekly or to-do',
    });
  });

  describe('weekly goals', () => {
    const weekly = { ...valid, title: 'Peloton ride', type: 'weekly' };

    it('keeps a whole-number target from 1 to 14', () => {
      for (const target of [1, 3, 14]) {
        expect(validateItemInput({ ...weekly, target })).toEqual({
          ok: true,
          value: { title: 'Peloton ride', listId: 'list-1', type: 'weekly', target },
        });
      }
    });

    it.each([0, 15, -1, 2.5, Number.NaN, undefined])('rejects the target %s', (target) => {
      expect(validateItemInput({ ...weekly, target })).toEqual({
        ok: false,
        error: 'Pick 1 to 14 times a week',
      });
    });

    it('exposes the allowed range', () => {
      expect([MIN_TARGET, MAX_TARGET]).toEqual([1, 14]);
    });

    it('ignores a target on daily habits and to-dos', () => {
      for (const type of ['daily', 'todo']) {
        expect(validateItemInput({ ...valid, type, target: 99 })).toEqual({
          ok: true,
          value: { title: 'Meditate', listId: 'list-1', type },
        });
      }
    });
  });

  describe('to-dos', () => {
    const todo = { title: 'Clean garage', listId: 'list-1', type: 'todo' };

    it('accepts no due date, an empty one, or a real day', () => {
      expect(validateItemInput(todo)).toEqual({ ok: true, value: todo });
      expect(validateItemInput({ ...todo, dueDate: '' })).toEqual({ ok: true, value: todo });
      expect(validateItemInput({ ...todo, dueDate: '2026-10-20' })).toEqual({
        ok: true,
        value: { ...todo, dueDate: '2026-10-20' },
      });
    });

    it.each(['2026-02-30', 'next week', '2026-1-5'])('rejects the due date %j', (dueDate) => {
      expect(validateItemInput({ ...todo, dueDate })).toEqual({
        ok: false,
        error: 'Pick a valid date',
      });
    });

    it('ignores a due date on habits and goals', () => {
      expect(validateItemInput({ ...valid, dueDate: '2026-10-20' })).toEqual({
        ok: true,
        value: valid,
      });
    });
  });

  it('reports the title problem before the list and type problems', () => {
    expect(validateItemInput({ title: '', listId: '', type: 'x' })).toEqual({
      ok: false,
      error: "Name can't be empty",
    });
  });
});
