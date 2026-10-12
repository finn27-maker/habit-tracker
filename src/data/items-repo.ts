import { addDaysToKey, dayKey, isDayKey, weekStartKey } from '../domain/dates';
import { validateItemInput, type Item } from '../domain/items';
import { err, ok, type Result } from '../domain/result';
import { latestDayInWeek, targetInForce, type TargetPoint } from '../domain/weekly';
import type { HabitDb, ItemRecord } from './db';
import { SAVE_ERROR, guard } from './errors';
import { newId as defaultNewId } from './ids';

export const ITEMS_LOAD_ERROR = "Couldn't load your habits. Close and reopen the app.";
const LIST_NOT_FOUND = 'List not found';
const ITEM_NOT_FOUND = 'Habit not found';
const NOT_WEEKLY = 'Not a weekly goal';
const NOT_TODO = 'Not a to-do';
const INVALID_DAY = 'Invalid day';
const FUTURE_DAY = "Pick a day that isn't in the future";

export interface ItemsRepoDeps {
  newId?: () => string;
  now?: () => number;
}

export interface ItemsRepo {
  /**
   * `target` (times per week) is required for weekly goals and ignored otherwise;
   * `dueDate` is optional for to-dos and ignored otherwise.
   */
  create(input: {
    title: string;
    listId: string;
    type: string;
    target?: number;
    dueDate?: string;
  }): Promise<Result<Item>>;
  /**
   * Changes name, list and, for weekly goals, the target from the current week onwards.
   * For to-dos, a missing or empty `dueDate` clears the due date.
   */
  update(
    itemId: string,
    input: { title: string; listId: string; target?: number; dueDate?: string },
  ): Promise<Result<Item>>;
  /** To-dos: checks it off (stamping the time) or reopens it. */
  setTodoDone(itemId: string, done: boolean): Promise<Result<Item>>;
  /**
   * "Delete" from the user's point of view: hides the item everywhere but keeps its
   * completions and target history so a later History screen can show or restore it.
   */
  archive(itemId: string): Promise<Result<void>>;
  /** Items that are not archived, ordered by their `order`. */
  listActive(): Promise<Result<Item[]>>;
  /**
   * Daily habits: marks the habit done on `day` (a local YYYY-MM-DD), or removes that mark
   * if it was already done. Resolves to whether it is done afterwards.
   */
  toggleDay(itemId: string, day: string): Promise<Result<boolean>>;
  /** Weekly goals: logs one more completion on `day`; several per day are allowed. */
  addCompletion(itemId: string, day: string): Promise<Result<void>>;
  /**
   * Weekly goals: removes the log made last on `day` (calendar backfill). Resolves to
   * whether there was one to remove.
   */
  removeCompletionOn(itemId: string, day: string): Promise<Result<boolean>>;
  /**
   * Weekly goals: removes the most recent completion in the week that starts on
   * `weekStart` (latest day, and the one logged last on that day). Resolves to whether
   * anything was removed.
   */
  removeLatestCompletion(itemId: string, weekStart: string): Promise<Result<boolean>>;
  /** Every item's completed days, keyed by item id. */
  completionDays(): Promise<Result<Record<string, string[]>>>;
  /** Every weekly goal's target records, keyed by item id. */
  listTargets(): Promise<Result<Record<string, TargetPoint[]>>>;
}

const isActive = (item: ItemRecord) => item.archivedAt === undefined;

const toItem = (record: ItemRecord): Item => ({
  id: record.id,
  listId: record.listId,
  type: record.type,
  title: record.title,
  order: record.order,
  ...(record.dueDate !== undefined ? { dueDate: record.dueDate } : {}),
  ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
});

/** A copy of the record without one optional field (put() then removes it from storage). */
function without(record: ItemRecord, field: 'dueDate' | 'completedAt'): ItemRecord {
  const copy = { ...record };
  delete copy[field];
  return copy;
}

export function createItemsRepo(db: HabitDb, deps: ItemsRepoDeps = {}): ItemsRepo {
  const newId = deps.newId ?? defaultNewId;
  const now = deps.now ?? Date.now;

  const currentWeekStart = () => weekStartKey(dayKey(new Date(now())));

  /** Why `day` can't be logged, if it can't: not a day, or after today. */
  function dayProblem(day: string): string | null {
    if (!isDayKey(day)) return INVALID_DAY;
    return day > dayKey(new Date(now())) ? FUTURE_DAY : null;
  }

  /** The order that puts a new item at the end of its list. */
  async function nextOrder(listId: string): Promise<number> {
    const siblings = await db.items.where('listId').equals(listId).filter(isActive).toArray();
    return siblings.reduce((highest, item) => Math.max(highest, item.order), -1) + 1;
  }

  return {
    create: async (input) => {
      const parsed = validateItemInput(input);
      if (!parsed.ok) return parsed;
      const { target, ...fields } = parsed.value;

      return guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, db.items, db.targetHistory, async () => {
          if (!(await db.lists.get(fields.listId))) return err(LIST_NOT_FOUND);
          const record: ItemRecord = {
            id: newId(),
            ...fields,
            order: await nextOrder(fields.listId),
          };
          await db.items.add(record);
          if (target !== undefined) {
            await db.targetHistory.put({
              itemId: record.id,
              effectiveWeekStart: currentWeekStart(),
              target,
            });
          }
          return ok(toItem(record));
        }),
      );
    },

    update: (itemId, input) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, db.items, db.targetHistory, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);

          const parsed = validateItemInput({ ...input, type: item.type });
          if (!parsed.ok) return parsed;
          const { title, listId, target, dueDate } = parsed.value;
          if (!(await db.lists.get(listId))) return err(LIST_NOT_FOUND);

          const order = listId === item.listId ? item.order : await nextOrder(listId);
          const record: ItemRecord = {
            ...without(item, 'dueDate'),
            title,
            listId,
            order,
            ...(dueDate !== undefined ? { dueDate } : {}),
          };
          await db.items.put(record);

          if (target !== undefined) {
            // Only the current week onwards changes; earlier weeks keep their own target.
            const week = currentWeekStart();
            const points = await db.targetHistory.where('itemId').equals(itemId).toArray();
            if (targetInForce(points, week) !== target) {
              await db.targetHistory.put({ itemId, effectiveWeekStart: week, target });
            }
          }
          return ok(toItem(record));
        }),
      ),

    archive: (itemId) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);
          await db.items.update(itemId, { archivedAt: now() });
          return ok(undefined);
        }),
      ),

    setTodoDone: (itemId, done) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);
          if (item.type !== 'todo') return err(NOT_TODO);

          const record = done ? { ...item, completedAt: now() } : without(item, 'completedAt');
          await db.items.put(record);
          return ok(toItem(record));
        }),
      ),

    listActive: () =>
      guard(ITEMS_LOAD_ERROR, async () => {
        const records = await db.items.filter(isActive).toArray();
        return ok(records.sort((a, b) => a.order - b.order).map(toItem));
      }),

    toggleDay: async (itemId, day) => {
      const problem = dayProblem(day);
      if (problem) return err(problem);

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

    addCompletion: async (itemId, day) => {
      const problem = dayProblem(day);
      if (problem) return err(problem);

      return guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, db.completions, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);
          if (item.type !== 'weekly') return err(NOT_WEEKLY);

          await db.completions.add({ id: newId(), itemId, dayKey: day, createdAt: now() });
          return ok(undefined);
        }),
      );
    },

    removeCompletionOn: async (itemId, day) => {
      if (!isDayKey(day)) return err(INVALID_DAY);

      return guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, db.completions, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);
          if (item.type !== 'weekly') return err(NOT_WEEKLY);

          const [latest] = (await db.completions.where('[itemId+dayKey]').equals([itemId, day]).toArray()).sort(
            (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
          );
          if (!latest) return ok(false);
          await db.completions.delete(latest.id);
          return ok(true);
        }),
      );
    },

    removeLatestCompletion: async (itemId, weekStart) => {
      if (!isDayKey(weekStart)) return err(INVALID_DAY);

      return guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, db.completions, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);

          const inWeek = await db.completions
            .where('[itemId+dayKey]')
            .between([itemId, weekStart], [itemId, addDaysToKey(weekStart, 6)], true, true)
            .toArray();
          const latestDay = latestDayInWeek(
            inWeek.map((completion) => completion.dayKey),
            weekStart,
          );
          if (latestDay === undefined) return ok(false);

          const [latest] = inWeek
            .filter((completion) => completion.dayKey === latestDay)
            .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
          await db.completions.delete(latest!.id);
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

    listTargets: () =>
      guard(ITEMS_LOAD_ERROR, async () => {
        const byItem: Record<string, TargetPoint[]> = {};
        for (const record of await db.targetHistory.toArray()) {
          (byItem[record.itemId] ??= []).push({
            effectiveWeekStart: record.effectiveWeekStart,
            target: record.target,
          });
        }
        return ok(byItem);
      }),
  };
}
