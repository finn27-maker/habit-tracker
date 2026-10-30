import { dayKey, parseDayKey } from './dates';
import { MAX_ITEM_TITLE } from './items';
import { MAX_NAME_LENGTH } from './lists';

/**
 * The owner's Personal Assistant (decision 29aac2be in that project). This is the only
 * outside origin the app may contact, and only once a pairing code is stored; the
 * Content-Security-Policy in index.html allows nothing else.
 */
export const ASSISTANT_ORIGIN = 'https://app.80dventures.com';
export const TODOS_URL = `${ASSISTANT_ORIGIN}/api/habit-tracker/todos`;
export const ACK_URL = `${ASSISTANT_ORIGIN}/api/habit-tracker/ack`;

/** Where a to-do goes when no list has its list name. */
export const FALLBACK_LIST = 'Assistant';

export interface IncomingTodo {
  id: string;
  title: string;
  /** The list name the assistant suggested; '' when none. */
  list: string;
  /** Local day key, YYYY-MM-DD. */
  due: string | undefined;
}

const CODE = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A pasted pairing code (256 bits, URL-safe base64), or null if it isn't one. */
export function normalizeCode(input: string): string | null {
  const code = input.trim();
  return CODE.test(code) ? code : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRealDay = (value: string) => DAY.test(value) && dayKey(parseDayKey(value)) === value;

/** Long titles are cut to fit the app's limit rather than refused, so they still arrive. */
const fitTitle = (title: string) =>
  title.length > MAX_ITEM_TITLE ? `${title.slice(0, MAX_ITEM_TITLE - 1)}…` : title;

function readTodo(raw: unknown): IncomingTodo | null {
  if (!isRecord(raw)) return null;
  const { id, title, list, due } = raw;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (due !== null && due !== undefined && (typeof due !== 'string' || !isRealDay(due))) return null;
  const name = typeof list === 'string' ? list.trim() : '';
  return {
    id,
    title: fitTitle(title.trim()),
    list: name.length <= MAX_NAME_LENGTH ? name : '',
    due: typeof due === 'string' ? due : undefined,
  };
}

/**
 * The to-dos in an assistant answer, checked field by field: the server is trusted only for
 * what it may send. Malformed to-dos are dropped, so they are never saved or acknowledged.
 */
export function parseTodos(body: unknown): IncomingTodo[] {
  if (!isRecord(body) || body.version !== 1 || !Array.isArray(body.todos)) return [];
  return body.todos.map(readTodo).filter((todo): todo is IncomingTodo => todo !== null);
}

/** The list whose name matches, ignoring case and surrounding spaces. */
export function matchList<T extends { name: string }>(lists: readonly T[], name: string): T | undefined {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return undefined;
  return lists.find((list) => list.name.trim().toLowerCase() === wanted);
}
