import { describe, expect, it } from 'vitest';
import {
  COLOR_NAMES,
  LIST_COLORS,
  STARTER_LISTS,
  isSingleEmoji,
  moveInOrder,
  validateListInput,
} from './lists';

const valid = { name: 'Reading', emoji: '📚', color: 'teal' };

describe('validateListInput', () => {
  it('accepts a valid list and trims the name and emoji', () => {
    expect(validateListInput({ name: '   Reading   ', emoji: ' 📚 ', color: 'teal' })).toEqual({
      ok: true,
      value: valid,
    });
  });

  it.each(['', '   '])('rejects the blank name %j', (name) => {
    expect(validateListInput({ ...valid, name })).toEqual({
      ok: false,
      error: "List name can't be empty",
    });
  });

  it('allows a 40-character name and rejects 41', () => {
    expect(validateListInput({ ...valid, name: 'a'.repeat(40) }).ok).toBe(true);
    expect(validateListInput({ ...valid, name: 'a'.repeat(41) })).toEqual({
      ok: false,
      error: 'List name must be 40 characters or fewer',
    });
  });

  it.each(['', 'ab', '7', '#', '📚📖', 'x📚'])('rejects the emoji %j', (emoji) => {
    expect(validateListInput({ ...valid, emoji })).toEqual({
      ok: false,
      error: 'Pick exactly one emoji',
    });
  });

  it('rejects a color that is not in the palette', () => {
    expect(validateListInput({ ...valid, color: 'mauve' })).toEqual({
      ok: false,
      error: 'Pick one of the listed colors',
    });
  });

  it('reports the name problem before the emoji and color problems', () => {
    expect(validateListInput({ name: '', emoji: 'ab', color: 'mauve' })).toEqual({
      ok: false,
      error: "List name can't be empty",
    });
  });
});

describe('isSingleEmoji', () => {
  it.each([
    ['plain emoji', '📚'],
    ['emoji with variation selector', '\u{1F3CB}️'],
    ['emoji with skin tone', '\u{1F44D}\u{1F3FD}'],
    ['zero-width-joiner family', '\u{1F468}‍\u{1F469}‍\u{1F467}'],
    ['flag', '\u{1F1FA}\u{1F1F8}'],
    ['keycap', '1️⃣'],
  ])('accepts %s', (_label, value) => {
    expect(isSingleEmoji(value)).toBe(true);
  });
});

describe('STARTER_LISTS', () => {
  it('are the four life areas in order', () => {
    expect(STARTER_LISTS.map((l) => l.name)).toEqual([
      'Fitness',
      'Work',
      'Side Business',
      'Personal',
    ]);
  });

  it('are all valid inputs using palette colors', () => {
    for (const list of STARTER_LISTS) {
      expect(validateListInput(list).ok).toBe(true);
      expect(COLOR_NAMES).toContain(list.color);
    }
  });
});

describe('LIST_COLORS', () => {
  it('maps every color name to a hex value', () => {
    expect(COLOR_NAMES).toHaveLength(9);
    for (const name of COLOR_NAMES) expect(LIST_COLORS[name]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('moveInOrder', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves an id up one place', () => {
    expect(moveInOrder(ids, 'c', 'up')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves an id down one place', () => {
    expect(moveInOrder(ids, 'b', 'down')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('leaves the order alone at the edges and for unknown ids', () => {
    expect(moveInOrder(ids, 'a', 'up')).toEqual(ids);
    expect(moveInOrder(ids, 'd', 'down')).toEqual(ids);
    expect(moveInOrder(ids, 'zzz', 'up')).toEqual(ids);
  });

  it('does not mutate its input', () => {
    const copy = [...ids];
    moveInOrder(copy, 'c', 'up');
    expect(copy).toEqual(ids);
  });
});
