import type { ItemType } from './items';
import { moveToIndex } from './lists';

interface Ordered {
  id: string;
  type: ItemType;
  order: number;
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
