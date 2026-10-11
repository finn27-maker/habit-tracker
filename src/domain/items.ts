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
}

/** What validation keeps: `target` is only present for weekly goals. */
export type ValidItem = ItemInput & { target?: number };

export function validateItemInput(input: {
  title: string;
  listId: string;
  type: string;
  target?: number;
}): Result<ValidItem> {
  const title = input.title.trim();

  if (title === '') return err("Name can't be empty");
  if (title.length > MAX_ITEM_TITLE) {
    return err(`Name must be ${MAX_ITEM_TITLE} characters or fewer`);
  }
  if (input.listId === '') return err('Pick a list');
  if (!ITEM_TYPES.includes(input.type as ItemType)) return err('Pick daily, weekly or to-do');

  const type = input.type as ItemType;
  if (type !== 'weekly') return ok({ title, listId: input.listId, type });

  const { target } = input;
  if (
    target === undefined ||
    !Number.isInteger(target) ||
    target < MIN_TARGET ||
    target > MAX_TARGET
  ) {
    return err(`Pick ${MIN_TARGET} to ${MAX_TARGET} times a week`);
  }
  return ok({ title, listId: input.listId, type, target });
}
