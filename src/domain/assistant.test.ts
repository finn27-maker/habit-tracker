import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACK_URL,
  ASSISTANT_ORIGIN,
  FALLBACK_LIST,
  TODOS_URL,
  matchList,
  normalizeCode,
  parseTodos,
} from './assistant';
import { MAX_ITEM_TITLE } from './items';
import { APP_VERSION } from './version';

const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';

const body = (...todos: unknown[]) => ({ version: 1, todos });
const todo = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1b2c3',
  title: 'Pay Xcel bill',
  list: 'Bills & Deadlines',
  due: '2026-11-03',
  note: '',
  ...overrides,
});

describe('the assistant address', () => {
  it('is the one origin the app may talk to', () => {
    expect(ASSISTANT_ORIGIN).toBe('https://app.80dventures.com');
    expect(TODOS_URL).toBe('https://app.80dventures.com/api/habit-tracker/todos');
    expect(ACK_URL).toBe('https://app.80dventures.com/api/habit-tracker/ack');
  });

  it('matches the Content-Security-Policy, which allows only it', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(/connect-src 'self' https:\/\/app\.80dventures\.com;/);
  });
});

describe('the version line', () => {
  it('shows the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe('normalizeCode', () => {
  it('accepts a 43-character code, ignoring spaces around it', () => {
    expect(normalizeCode(`  ${CODE}\n`)).toBe(CODE);
  });

  it.each([
    ['hello'],
    [''],
    [CODE.slice(1)],
    [`${CODE}x`],
    [`${CODE.slice(0, 20)} ${CODE.slice(21)}`],
    [`${CODE.slice(0, 42)}+`],
  ])('refuses %j', (input) => {
    expect(normalizeCode(input)).toBeNull();
  });
});

describe('parseTodos', () => {
  it('reads valid to-dos', () => {
    expect(parseTodos(body(todo(), todo({ id: 'z9', list: '', due: null })))).toEqual([
      { id: 'a1b2c3', title: 'Pay Xcel bill', list: 'Bills & Deadlines', due: '2026-11-03' },
      { id: 'z9', title: 'Pay Xcel bill', list: '', due: undefined },
    ]);
  });

  it.each([[null], ['text'], [[]], [{ version: 2, todos: [todo()] }], [{ version: 1 }], [{ version: 1, todos: {} }]])(
    'returns nothing for a body it does not understand: %j',
    (raw) => {
      expect(parseTodos(raw)).toEqual([]);
    },
  );

  it.each([
    ['no title', { title: undefined }],
    ['a blank title', { title: '   ' }],
    ['a title that is not text', { title: 5 }],
    ['a slash-style date', { due: '11/03/2026' }],
    ['a date that does not exist', { due: '2026-02-30' }],
    ['a due date that is not text', { due: 20261103 }],
    ['no id', { id: undefined }],
    ['an id with odd characters', { id: '../accounts' }],
    ['an id over 64 characters', { id: 'x'.repeat(65) }],
  ])('skips a to-do with %s', (_label, overrides) => {
    expect(parseTodos(body(todo(overrides), todo({ id: 'ok' })))).toEqual([
      expect.objectContaining({ id: 'ok' }),
    ]);
  });

  it('skips entries that are not objects', () => {
    expect(parseTodos(body('x', null, 7, todo()))).toHaveLength(1);
  });

  it('trims titles and list names', () => {
    expect(parseTodos(body(todo({ title: '  Call Dave  ', list: '  Work ' })))[0]).toMatchObject({
      title: 'Call Dave',
      list: 'Work',
    });
  });

  it(`shortens titles over ${MAX_ITEM_TITLE} characters to fit`, () => {
    const [shortened] = parseTodos(body(todo({ title: 'a'.repeat(75) })));
    expect(shortened!.title).toHaveLength(MAX_ITEM_TITLE);
    expect(shortened!.title).toBe(`${'a'.repeat(MAX_ITEM_TITLE - 1)}…`);
    const [exact] = parseTodos(body(todo({ title: 'b'.repeat(MAX_ITEM_TITLE) })));
    expect(exact!.title).toBe('b'.repeat(MAX_ITEM_TITLE));
  });

  it('treats a missing, odd or too-long list name as no list', () => {
    const lists = parseTodos(body(todo({ id: 'a', list: undefined }), todo({ id: 'b', list: 3 }), todo({ id: 'c', list: 'L'.repeat(41) })));
    expect(lists.map((t) => t.list)).toEqual(['', '', '']);
  });
});

describe('matchList', () => {
  const lists = [
    { id: 'l1', name: 'Personal' },
    { id: 'l2', name: 'Bills & Deadlines' },
  ];

  it('matches regardless of case and surrounding spaces', () => {
    expect(matchList(lists, ' bills & DEADLINES ')).toEqual(lists[1]);
  });

  it('finds nothing for an unknown or empty name', () => {
    expect(matchList(lists, 'Groceries')).toBeUndefined();
    expect(matchList(lists, '')).toBeUndefined();
  });

  it('falls back to a list named Assistant', () => {
    expect(FALLBACK_LIST).toBe('Assistant');
  });
});
