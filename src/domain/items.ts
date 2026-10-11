import { err, ok, type Result } from './result';

export const ITEM_TYPES = ['daily', 'weekly', 'todo'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const MAX_ITEM_TITLE = 60;

export interface ItemInput {
  title: string;
  listId: string;
  type: ItemType;
}

export interface Item extends ItemInput {
  id: string;
  order: number;
}

export function validateItemInput(input: {
  title: string;
  listId: string;
  type: string;
}): Result<ItemInput> {
  const title = input.title.trim();

  if (title === '') return err("Name can't be empty");
  if (title.length > MAX_ITEM_TITLE) {
    return err(`Name must be ${MAX_ITEM_TITLE} characters or fewer`);
  }
  if (input.listId === '') return err('Pick a list');
  if (!ITEM_TYPES.includes(input.type as ItemType)) return err('Pick daily, weekly or to-do');

  return ok({ title, listId: input.listId, type: input.type as ItemType });
}
