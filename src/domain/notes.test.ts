import { describe, expect, it } from 'vitest';
import { parseTodos } from './assistant';
import { createBackup, parseBackup } from './backup';
import { MAX_NOTE, NOTE_TOO_LONG, cleanNote, fitNote, validateItemInput } from './items';

describe('cleanNote', () => {
  it('trims, keeps line breaks and removes control characters', () => {
    expect(cleanNote('  by the 1st  ')).toBe('by the 1st');
    expect(cleanNote('milk\r\neggs\rbread')).toBe('milk\neggs\nbread');
    expect(cleanNote('a\u0000b\u001bc\td\u007f')).toBe('abcd');
    expect(cleanNote('   ')).toBe('');
  });
});

describe('fitNote (from outside the app)', () => {
  it('cuts a long note with an ellipsis instead of refusing it', () => {
    const fitted = fitNote('x'.repeat(300))!;
    expect(fitted).toHaveLength(MAX_NOTE);
    expect(fitted.endsWith('…')).toBe(true);
    expect(fitNote('x'.repeat(MAX_NOTE))).toBe('x'.repeat(MAX_NOTE));
  });

  it('ignores blanks and anything that is not text', () => {
    expect(fitNote('  ')).toBeUndefined();
    expect(fitNote(42)).toBeUndefined();
    expect(fitNote(null)).toBeUndefined();
    expect(fitNote(undefined)).toBeUndefined();
  });
});

describe('validateItemInput with a note', () => {
  const todo = { title: 'Buy paint', listId: 'list-1', type: 'todo' };

  it('keeps a cleaned note on a to-do', () => {
    expect(validateItemInput({ ...todo, note: '  the blue one  ' })).toEqual({
      ok: true,
      value: { title: 'Buy paint', listId: 'list-1', type: 'todo', note: 'the blue one' },
    });
    expect(validateItemInput({ ...todo, note: 'x', dueDate: '2026-11-04' })).toEqual({
      ok: true,
      value: { title: 'Buy paint', listId: 'list-1', type: 'todo', note: 'x', dueDate: '2026-11-04' },
    });
  });

  it('drops a blank note and refuses one over the limit', () => {
    expect(validateItemInput({ ...todo, note: '   ' })).toEqual({
      ok: true,
      value: { title: 'Buy paint', listId: 'list-1', type: 'todo' },
    });
    expect(validateItemInput({ ...todo, note: 'x'.repeat(MAX_NOTE + 1) })).toEqual({
      ok: false,
      error: NOTE_TOO_LONG,
    });
    expect(NOTE_TOO_LONG).toBe('Notes must be 200 characters or fewer');
  });

  it('ignores a note on habits', () => {
    const habit = validateItemInput({ ...todo, type: 'daily', note: 'x' });
    expect(habit.ok && 'note' in habit.value).toBe(false);
  });
});

describe('notes from the assistant', () => {
  const body = (...todos: unknown[]) => ({ version: 1, todos });
  const todo = (extra: Record<string, unknown>) => ({ id: 't1', title: 'Pay the plumber', list: '', due: null, ...extra });

  it('reads "note", or "notes", and "note" wins', () => {
    expect(parseTodos(body(todo({ note: 'next week' })))[0]!.note).toBe('next week');
    expect(parseTodos(body(todo({ notes: 'sometime in November' })))[0]!.note).toBe('sometime in November');
    expect(parseTodos(body(todo({ note: 'next week', notes: 'later' })))[0]!.note).toBe('next week');
    expect(parseTodos(body(todo({ note: '  ', notes: 'later' })))[0]!.note).toBe('later');
  });

  it('keeps the to-do when the note is missing, blank or not text', () => {
    for (const extra of [{}, { note: '' }, { note: '  ' }, { note: 42 }]) {
      const [parsed] = parseTodos(body(todo(extra)));
      expect(parsed?.title).toBe('Pay the plumber');
      expect(parsed?.note).toBeUndefined();
    }
  });

  it('cleans and cuts what it is sent', () => {
    expect(parseTodos(body(todo({ note: 'a\u0000b\nc' })))[0]!.note).toBe('ab\nc');
    expect(parseTodos(body(todo({ note: 'y'.repeat(300) })))[0]!.note).toBe(`${'y'.repeat(199)}…`);
  });
});

describe('notes in backups', () => {
  const data = (note?: unknown) => ({
    lists: [{ id: 'l1', name: 'Home', emoji: '🏡', color: 'green', order: 0 }],
    items: [
      { id: 'i1', listId: 'l1', type: 'todo', title: 'Buy paint', order: 0, ...(note === undefined ? {} : { note }) },
    ],
    completions: [],
    targetHistory: [],
  });
  const file = (note?: unknown) =>
    JSON.stringify(createBackup(data(note) as never, new Date(2026, 9, 30)));

  it('come back on restore, and older backups without notes still restore', () => {
    const withNote = parseBackup(file('the blue one'));
    expect(withNote.ok && withNote.value.data.items[0]!.note).toBe('the blue one');
    const older = parseBackup(file());
    expect(older.ok && 'note' in older.value.data.items[0]!).toBe(false);
  });

  it('make a file with a note that is not text damaged', () => {
    const damaged = parseBackup(file(42));
    expect(damaged.ok).toBe(false);
  });
});
