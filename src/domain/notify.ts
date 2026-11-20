import { isDayKey } from './dates';

/** What the assistant server may learn: the days with something due, never titles (s30). */
export const MAX_DUE_DAYS = 400;
/** Titles shown in one notification before "and N more". */
const SHOWN = 3;
const MAX_TITLE = 60;

/** The fields of a stored to-do the notifications look at. */
export interface NotifyTodo {
  type: string;
  title: string;
  order: number;
  dueDate?: string;
  completedAt?: number;
  archivedAt?: number;
}

/** A push from the assistant server, once checked. */
export type PushMessage =
  | { kind: 'due'; day: string }
  | { kind: 'arrivals'; count: number; titles: string[] };

export interface NoteText {
  title: string;
  body: string;
}

/** Shown when a push can't be read: iOS requires every push to show something. */
export const FALLBACK_NOTE: NoteText = { title: 'Habit Tracker', body: "Open the app to see what's new." };

const isOpenDated = (todo: NotifyTodo): todo is NotifyTodo & { dueDate: string } =>
  todo.type === 'todo' &&
  todo.completedAt === undefined &&
  todo.archivedAt === undefined &&
  todo.dueDate !== undefined &&
  isDayKey(todo.dueDate);

/** The distinct days open to-dos are due, earliest first, at most MAX_DUE_DAYS of them. */
export function dueDays(todos: readonly NotifyTodo[]): string[] {
  return [...new Set(todos.filter(isOpenDated).map((todo) => todo.dueDate))].sort().slice(0, MAX_DUE_DAYS);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A, B, C and 2 more" for `total` things of which `titles` are known. */
function names(titles: readonly string[], total: number): string {
  const shown = titles.slice(0, SHOWN);
  const rest = total - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
}

/** The 7:00 am summary for `day`, from the phone's own to-dos: overdue first, then by order. */
export function dueSummary(todos: readonly NotifyTodo[], day: string): NoteText {
  const due = todos
    .filter(isOpenDated)
    .filter((todo) => todo.dueDate <= day)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.order - b.order);
  if (due.length === 0) return { title: 'All caught up', body: 'Nothing is due today.' };
  const overdue = due.filter((todo) => todo.dueDate < day).length;
  return {
    title: `${plural(due.length, 'to-do')} due today${overdue > 0 ? ` (${overdue} overdue)` : ''}`,
    body: names(
      due.map((todo) => todo.title),
      due.length,
    ),
  };
}

/** New to-dos from the assistant, as the server described them. */
export function arrivalsNote(message: Extract<PushMessage, { kind: 'arrivals' }>): NoteText {
  return {
    title: `${plural(message.count, 'new to-do')} from your assistant`,
    body: message.titles.length > 0 ? names(message.titles, message.count) : 'Open Habit Tracker to see them.',
  };
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const cleanTitle = (value: unknown) =>
  typeof value === 'string' ? value.replace(CONTROL, ' ').trim().slice(0, MAX_TITLE) : '';

/** Checks a push payload from the server; null for anything it doesn't recognise. */
export function parsePush(data: unknown): PushMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.kind === 'due') {
    return typeof message.day === 'string' && isDayKey(message.day) ? { kind: 'due', day: message.day } : null;
  }
  if (message.kind === 'arrivals') {
    const { count } = message;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 999) return null;
    const titles = Array.isArray(message.titles)
      ? message.titles.map(cleanTitle).filter((title) => title !== '').slice(0, SHOWN)
      : [];
    return { kind: 'arrivals', count, titles };
  }
  return null;
}
