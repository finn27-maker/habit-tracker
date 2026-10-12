import { countLabel } from './history';
import { kindTitle, type Item } from './items';
import type { List } from './lists';

/** A deleted (archived) habit, goal or to-do; its history is kept. */
export interface ArchivedItem extends Item {
  archivedAt: number;
}

export interface DeletedRow {
  item: ArchivedItem;
  /** "Daily habit · Personal · Deleted Oct 12". */
  detail: string;
}

const sameYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const otherYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Deleted items, most recently deleted first, each described in one line. */
export function deletedRows(items: readonly ArchivedItem[], lists: readonly List[], today: string): DeletedRow[] {
  const names = new Map(lists.map((list) => [list.id, list.name]));
  return [...items]
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .map((item) => {
      const date = new Date(item.archivedAt);
      const when = (date.getFullYear() === Number(today.slice(0, 4)) ? sameYear : otherYear).format(date);
      const listName = names.get(item.listId) ?? 'Deleted list';
      return { item, detail: `${kindTitle(item.type)} · ${listName} · Deleted ${when}` };
    });
}

/** Asked before one deleted item is removed for good. */
export const deleteForeverQuestion = (title: string) =>
  `Delete “${title}” for good? Its history goes too. This can't be undone.`;

/** Asked before Recently deleted is emptied. */
export const emptyQuestion = (count: number) =>
  `Delete all ${countLabel(count, 'item')} for good? Their history goes too. This can't be undone.`;

/**
 * Where a restored item goes: back to its own list, or to the first list if that one was
 * deleted (`movedTo` names it so the user can be told). Null when there are no lists.
 */
export function restoreTarget(
  item: ArchivedItem,
  lists: readonly List[],
): { listId: string; movedTo: string | null } | null {
  if (lists.some((list) => list.id === item.listId)) return { listId: item.listId, movedTo: null };
  const first = [...lists].sort((a, b) => a.order - b.order)[0];
  return first ? { listId: first.id, movedTo: first.name } : null;
}
