import { isDayKey } from '../domain/dates';
import { validateItemInput, type Item } from '../domain/items';
import { err, ok, type Result } from '../domain/result';
import type { HabitDb, ItemRecord } from './db';
import { SAVE_ERROR, guard } from './errors';
import { newId as defaultNewId } from './ids';

export const ITEMS_LOAD_ERROR = "Couldn't load your habits. Close and reopen the app.";
const LIST_NOT_FOUND = 'List not found';
const ITEM_NOT_FOUND = 'Habit not found';
const INVALID_DAY = 'Invalid day';

export interface ItemsRepoDeps {
  newId?: () => string;
  now?: () => number;
}

export interface ItemsRepo {
  create(input: { title: string; listId: string; type: string }): Promise<Result<Item>>;
  /** Items that are not archived, ordered by their `order`. */
  listActive(): Promise<Result<Item[]>>;
  /**
   * Marks the habit done on `day` (a local YYYY-MM-DD), or removes that mark if it was
   * already done. Resolves to whether it is done afterwards.
   */
  toggleDay(itemId: string, day: string): Promise<Result<boolean>>;
  /** Every habit's completed days, keyed by item id. */
  completionDays(): Promise<Result<Record<string, string[]>>>;
}

const isActive = (item: ItemRecord) => item.archivedAt === undefined;

const toItem = (record: ItemRecord): Item => ({
  id: record.id,
  listId: record.listId,
  type: record.type,
  title: record.title,
  order: record.order,
});

export function createItemsRepo(db: HabitDb, deps: ItemsRepoDeps = {}): ItemsRepo {
  const newId = deps.newId ?? defaultNewId;
  const now = deps.now ?? Date.now;

  return {
    create: async (input) => {
      const parsed = validateItemInput(input);
      if (!parsed.ok) return parsed;
      const { listId } = parsed.value;

      return guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, db.items, async () => {
          if (!(await db.lists.get(listId))) return err(LIST_NOT_FOUND);
          const siblings = await db.items.where('listId').equals(listId).filter(isActive).toArray();
          const order = siblings.reduce((highest, item) => Math.max(highest, item.order), -1) + 1;
          const record: ItemRecord = { id: newId(), ...parsed.value, order };
          await db.items.add(record);
          return ok(toItem(record));
        }),
      );
    },

    listActive: () =>
      guard(ITEMS_LOAD_ERROR, async () => {
        const records = await db.items.filter(isActive).toArray();
        return ok(records.sort((a, b) => a.order - b.order).map(toItem));
      }),

    toggleDay: async (itemId, day) => {
      if (!isDayKey(day)) return err(INVALID_DAY);

      return guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, db.completions, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);

          const removed = await db.completions
            .where('[itemId+dayKey]')
            .equals([itemId, day])
            .delete();
          if (removed > 0) return ok(false);

          await db.completions.add({ id: newId(), itemId, dayKey: day, createdAt: now() });
          return ok(true);
        }),
      );
    },

    completionDays: () =>
      guard(ITEMS_LOAD_ERROR, async () => {
        const byItem: Record<string, string[]> = {};
        for (const completion of await db.completions.toArray()) {
          (byItem[completion.itemId] ??= []).push(completion.dayKey);
        }
        return ok(byItem);
      }),
  };
}
