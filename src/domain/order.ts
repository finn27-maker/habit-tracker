import type { ItemType } from './items';
import { moveToIndex } from './lists';
import { compareTodos } from './todos';

interface Ordered {
  id: string;
  type: ItemType;
  order: number;
}

interface OrderedTodo extends Ordered {
  dueDate?: string;
  completedAt?: number;
}

/** The order a list page shows its open to-dos in: the list's own order, or by due date. */
export const compareListTodos = (manual: boolean) =>
  manual ? (a: Ordered, b: Ordered) => a.order - b.order : compareTodos;

/**
 * The to-dos whose order changes when open to-do `itemId` moves to place `index` (clamped) among
 * the open to-dos as the list page shows them. A list not yet in its own order (`manual` false)
 * first numbers every open to-do in the order on screen, so nothing jumps; after that only the
 * moved to-do changes, placed between its new neighbours, so finished to-dos keep their place.
 */
export function moveTodo<T extends OrderedTodo>(
  listItems: readonly T[],
  itemId: string,
  index: number,
  manual: boolean,
): T[] {
  const open = listItems
    .filter((item) => item.type === 'todo' && item.completedAt === undefined)
    .sort(compareListTodos(manual));
  if (!open.some((item) => item.id === itemId)) return [];
  const byId = new Map(open.map((item) => [item.id, item]));
  const moved = moveToIndex(
    open.map((item) => item.id),
    itemId,
    index,
  ).map((id) => byId.get(id)!);
  const renumbered = () => moved.map((item, order) => ({ ...item, order }));
  if (!manual) return renumbered();

  const at = moved.findIndex((item) => item.id === itemId);
  const before = moved[at - 1]?.order;
  const after = moved[at + 1]?.order;
  const order =
    before === undefined
      ? (after ?? 0) - 1
      : after === undefined
        ? before + 1
        : (before + after) / 2;
  // Halving can run out of room after very many moves in the same gap: then number them all.
  if (order === before || order === after) return renumbered();
  return [{ ...moved[at]!, order }];
}

/**
 * A list's items after moving habit or goal `itemId` to place `index` among the list's habits
 * and goals (clamped). Habits and goals come first, renumbered from 0; to-dos follow in their
 * existing order (on screen they sort by due date anyway).
 */
export function moveRecurring<T extends Ordered>(siblings: readonly T[], itemId: string, index: number): T[] {
  const sorted = [...siblings].sort((a, b) => a.order - b.order);
  const recurring = sorted.filter((item) => item.type !== 'todo');
  const todos = sorted.filter((item) => item.type === 'todo');
  const byId = new Map(recurring.map((item) => [item.id, item]));
  const ids = moveToIndex(
    recurring.map((item) => item.id),
    itemId,
    index,
  );
  return [...ids.map((id) => byId.get(id)!), ...todos].map((item, order) => ({ ...item, order }));
}
