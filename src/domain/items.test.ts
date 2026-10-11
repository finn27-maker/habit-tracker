import { describe, expect, it } from 'vitest';
import { ITEM_TYPES, MAX_ITEM_TITLE, validateItemInput } from './items';

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
    for (const type of ITEM_TYPES) expect(validateItemInput({ ...valid, type }).ok).toBe(true);
    expect(validateItemInput({ ...valid, type: 'monthly' })).toEqual({
      ok: false,
      error: 'Pick daily, weekly or to-do',
    });
  });

  it('reports the title problem before the list and type problems', () => {
    expect(validateItemInput({ title: '', listId: '', type: 'x' })).toEqual({
      ok: false,
      error: "Name can't be empty",
    });
  });
});
