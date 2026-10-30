import { isDayKey } from './dates';
import { err, ok, type Result } from './result';

export const ITEM_TYPES = ['daily', 'weekly', 'todo'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/**
 * How each kind of item is named and explained, in the order they are offered. To-do comes
 * first: it is what + starts on, because quick one-off tasks are the most common thing added.
 */
export const ITEM_KINDS: readonly { type: ItemType; title: string; description: string }[] = [
  { type: 'todo', title: 'To-do', description: 'Once, with an optional due date' },
  { type: 'daily', title: 'Daily habit', description: 'Every day, with a streak' },
  { type: 'weekly', title: 'Weekly goal', description: 'A number of times each week' },
];

export const kindTitle = (type: ItemType) => ITEM_KINDS.find((kind) => kind.type === type)!.title;

/**
 * The question asked before an item changes to or from a to-do, whose history can't carry
 * over (it is kept, though). Null when no question is needed: daily <-> weekly keeps it all.
 */
export function typeChangeQuestion(title: string, from: ItemType, to: ItemType): string | null {
  if (from === to || (from !== 'todo' && to !== 'todo')) return null;
  return to === 'todo'
    ? `Change “${title}” to a to-do? Its check-ins are kept and come back if you change it back.`
    : `Change “${title}” to a ${kindTitle(to).toLowerCase()}? Its due date and checkmark are kept and come back if you change it back.`;
}

export const MAX_ITEM_TITLE = 60;
export const MIN_TARGET = 1;
export const MAX_TARGET = 14;
export const MAX_NOTE = 200;
export const NOTE_TOO_LONG = `Notes must be ${MAX_NOTE} characters or fewer`;

// Every control character except the line feed that separates lines.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

/** A note as stored: one kind of line break, no control characters, no outer spaces. */
export const cleanNote = (raw: string) => raw.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();

/**
 * A note from outside the app (the assistant): cleaned and cut to fit with an ellipsis rather
 * than refused, so the to-do still arrives. Undefined when there is nothing left to keep.
 */
export function fitNote(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const note = cleanNote(raw);
  if (note === '') return undefined;
  return note.length > MAX_NOTE ? `${note.slice(0, MAX_NOTE - 1)}…` : note;
}

export interface ItemInput {
  title: string;
  listId: string;
  type: ItemType;
}

export interface Item extends ItemInput {
  id: string;
  order: number;
  /** To-dos only: local day it is due (YYYY-MM-DD). */
  dueDate?: string;
  /** To-dos only: when it was checked off. */
  completedAt?: number;
  /** To-dos only: a short note, from the user or the assistant. */
  note?: string;
}

/**
 * What validation keeps: `target` only for weekly goals, `dueDate` and `note` only for
 * to-dos (and only when one was given).
 */
export type ValidItem = ItemInput & { target?: number; dueDate?: string; note?: string };

export function validateItemInput(input: {
  title: string;
  listId: string;
  type: string;
  target?: number;
  dueDate?: string;
  /** To-dos only; '' or blank means no note. */
  note?: string;
}): Result<ValidItem> {
  const title = input.title.trim();

  if (title === '') return err("Name can't be empty");
  if (title.length > MAX_ITEM_TITLE) {
    return err(`Name must be ${MAX_ITEM_TITLE} characters or fewer`);
  }
  if (input.listId === '') return err('Pick a list');
  if (!ITEM_TYPES.includes(input.type as ItemType)) return err('Pick daily, weekly or to-do');

  const type = input.type as ItemType;
  const base = { title, listId: input.listId, type };

  if (type === 'todo') {
    const { dueDate } = input;
    const note = cleanNote(input.note ?? '');
    if (note.length > MAX_NOTE) return err(NOTE_TOO_LONG);
    const withNote = note === '' ? base : { ...base, note };
    if (dueDate === undefined || dueDate === '') return ok(withNote);
    if (!isDayKey(dueDate)) return err('Pick a valid date');
    return ok({ ...withNote, dueDate });
  }

  if (type === 'daily') return ok(base);

  const { target } = input;
  if (
    target === undefined ||
    !Number.isInteger(target) ||
    target < MIN_TARGET ||
    target > MAX_TARGET
  ) {
    return err(`Pick ${MIN_TARGET} to ${MAX_TARGET} times a week`);
  }
  return ok({ ...base, target });
}
