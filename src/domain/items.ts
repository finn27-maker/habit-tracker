import { isDayKey } from './dates';
import { err, ok, type Result } from './result';

export const ITEM_TYPES = ['daily', 'weekly', 'todo'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const MAX_ITEM_TITLE = 60;
export const MIN_TARGET = 1;
export const MAX_TARGET = 14;

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
}

/**
 * What validation keeps: `target` only for weekly goals, `dueDate` only for to-dos
 * (and only when one was chosen).
 */
export type ValidItem = ItemInput & { target?: number; dueDate?: string };

export function validateItemInput(input: {
  title: string;
  listId: string;
  type: string;
  target?: number;
  dueDate?: string;
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
    if (dueDate === undefined || dueDate === '') return ok(base);
    if (!isDayKey(dueDate)) return err('Pick a valid date');
    return ok({ ...base, dueDate });
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
