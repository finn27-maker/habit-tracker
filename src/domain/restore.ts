import { backupDateLabel, type BackupData, type BackupItem, type BackupList } from './backup';

/** One list in a backup, and what adding it back would bring onto the phone. */
export interface ListRestore {
  id: string;
  name: string;
  emoji: string;
  /** The phone no longer has this list, so it would come back too. */
  deleted: boolean;
  /** Habits, goals and to-dos the phone doesn't have. */
  items: number;
  checkIns: number;
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/**
 * Which backup items count as missing: not deleted in the backup, and not on the phone at all
 * (an item in Recently deleted is already recoverable there), nor an assistant to-do the phone
 * already has under another id.
 */
function isMissing(current: BackupData) {
  const ids = new Set(current.items.map((item) => item.id));
  const assistantIds = new Set(current.items.flatMap((item) => (item.assistantId ? [item.assistantId] : [])));
  return (item: BackupItem) =>
    item.archivedAt === undefined &&
    !ids.has(item.id) &&
    !(item.assistantId !== undefined && assistantIds.has(item.assistantId));
}

/** Each list in the backup, in its order, with what it would add back. */
export function restorePlan(backup: BackupData, current: BackupData): ListRestore[] {
  const missing = isMissing(current);
  const phoneLists = new Set(current.lists.map((list) => list.id));
  return [...backup.lists].sort(byOrder).map((list) => {
    const items = backup.items.filter((item) => item.listId === list.id && missing(item));
    const ids = new Set(items.map((item) => item.id));
    return {
      id: list.id,
      name: list.name,
      emoji: list.emoji,
      deleted: !phoneLists.has(list.id),
      items: items.length,
      checkIns: backup.completions.filter((completion) => ids.has(completion.itemId)).length,
    };
  });
}

/** A business link list by list, including the single link older versions saved. */
const businessIds = (list: BackupList) => [
  ...(list.businessIds ?? []),
  ...(list.businessId !== undefined ? [list.businessId] : []),
];

/**
 * The records to add for the ticked lists. Deleted lists come back after the phone's lists
 * (without any business already linked elsewhere); missing items go after their list's items,
 * in backup order, with their check-ins and weekly targets. Nothing on the phone is changed.
 */
export function restoreAdditions(
  backup: BackupData,
  current: BackupData,
  listIds: readonly string[],
): BackupData {
  const chosen = new Set(listIds);
  const missing = isMissing(current);
  const phoneLists = new Set(current.lists.map((list) => list.id));
  const linked = new Set(current.lists.flatMap(businessIds));
  let nextListOrder = Math.max(-1, ...current.lists.map((list) => list.order)) + 1;

  const lists = [...backup.lists]
    .sort(byOrder)
    .filter((list) => chosen.has(list.id) && !phoneLists.has(list.id))
    .map((list): BackupList => {
      const free = businessIds(list).filter((id) => !linked.has(id));
      return {
        id: list.id,
        name: list.name,
        emoji: list.emoji,
        color: list.color,
        order: nextListOrder++,
        ...(list.manualTodoOrder ? { manualTodoOrder: true } : {}),
        ...(free.length > 0 ? { businessIds: free } : {}),
      };
    });

  const items = [...chosen].flatMap((listId) => {
    let next =
      Math.max(-1, ...current.items.filter((item) => item.listId === listId).map((item) => item.order)) + 1;
    return backup.items
      .filter((item) => item.listId === listId && missing(item))
      .sort(byOrder)
      .map((item) => ({ ...item, order: next++ }));
  });

  const added = new Set(items.map((item) => item.id));
  const completionIds = new Set(current.completions.map((completion) => completion.id));
  return {
    lists,
    items,
    completions: backup.completions.filter(
      (completion) => added.has(completion.itemId) && !completionIds.has(completion.id),
    ),
    targetHistory: backup.targetHistory.filter((point) => added.has(point.itemId)),
  };
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a list row in the pick sheet says: "3 to add back (212 check-ins)", "nothing missing"… */
export function restoreListLabel(list: ListRestore): string {
  const what =
    list.items === 0
      ? list.deleted
        ? ''
        : 'nothing missing'
      : `${list.items} to add back${list.checkIns > 0 ? ` (${count(list.checkIns, 'check-in')})` : ''}`;
  if (!list.deleted) return what;
  return what === '' ? 'deleted list' : `deleted list · ${what}`;
}

/** Whether a list row can be ticked: it would bring something back. */
export const canAddBack = (list: ListRestore) => list.deleted || list.items > 0;

/** The Add back button for the ticked lists: "Add back 4 items", or "Add back" when nothing is ticked. */
export function addBackButton(plan: readonly ListRestore[], picked: readonly string[]) {
  const ticked = plan.filter((list) => picked.includes(list.id) && canAddBack(list));
  const items = ticked.reduce((sum, list) => sum + list.items, 0);
  const lists = ticked.filter((list) => list.deleted).length;
  if (items > 0) return { text: `Add back ${count(items, 'item')}`, enabled: true };
  if (lists > 0) return { text: `Add back ${count(lists, 'list')}`, enabled: true };
  return { text: 'Add back', enabled: false };
}

/** The notice once added: "Added back 4 items from the backup of Nov 10, 2026." */
export function addedBackMessage(added: BackupData, exportedAt: string): string {
  const what = added.items.length > 0 ? count(added.items.length, 'item') : count(added.lists.length, 'list');
  return `Added back ${what} from the backup of ${backupDateLabel(Date.parse(exportedAt))}.`;
}
