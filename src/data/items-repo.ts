import { addDaysToKey, dayKey, isDayKey, weekStartKey } from '../domain/dates';
import { restoreTarget, type ArchivedItem } from '../domain/deleted';
import { validateItemInput, type Item } from '../domain/items';
import type { ListColor } from '../domain/lists';
import { moveRecurring } from '../domain/order';
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
const NO_LIST = 'Create a list first, then restore.';
const TODO_ORDER = 'To-dos follow their due dates';
const INVALID_DAY = 'Invalid day';
const FUTURE_DAY = "Pick a day that isn't in the future";

export interface ItemsRepoDeps {
  newId?: () => string;
  now?: () => number;
}

export interface ItemsRepo {
  /**
   * `target` (times per week) is required for weekly goals and ignored otherwise;
   * `dueDate` and `note` are optional for to-dos and ignored otherwise.
   */
  create(input: {
    title: string;
    listId: string;
    type: string;
    target?: number;
    dueDate?: string;
    note?: string;
  }): Promise<Result<Item>>;
  /**
   * Changes name, list and, for weekly goals, the target from the current week onwards.
   * For to-dos, a missing or empty `dueDate` clears the due date.
   */
  /**
   * Edits an item. `type` may change it: check-ins, due date and checkmark are all kept, so
   * switching back brings them back. A first switch to weekly applies `target` from the week
   * of its earliest check-in, so past weeks count too.
   */
  update(
    itemId: string,
    input: {
      title: string;
      listId: string;
      type?: string;
      target?: number;
      dueDate?: string;
      /** To-dos: the new note ('' clears it). Left out, the note stays as it is. */
      note?: string;
    },
  ): Promise<Result<Item>>;
  /** To-dos: checks it off (stamping the time) or reopens it. */
  setTodoDone(itemId: string, done: boolean): Promise<Result<Item>>;
  /** Deleted (archived) items, for Recently deleted. */
  listArchived(): Promise<Result<ArchivedItem[]>>;
  /**
   * Un-deletes an item at the end of its list, or of the first list if its own was deleted
   * (`movedTo` names that list). History was never removed, so streaks come back too.
   */
  restore(itemId: string): Promise<Result<{ item: Item; movedTo: string | null }>>;
  /** Permanently removes one deleted item with its check-ins and targets. Can't be undone. */
  deleteForever(itemId: string): Promise<Result<void>>;
  /** Permanently removes every deleted item with its history. Resolves to how many. */
  emptyDeleted(): Promise<Result<number>>;
  /** Deletes (archives) a list's completed to-dos. Resolves to how many. */
  clearCompleted(listId: string): Promise<Result<number>>;
  /** Moves a habit or goal to place `index` among its list's habits and goals (clamped). */
  moveTo(itemId: string, index: number): Promise<Result<void>>;
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
  ...(record.note !== undefined ? { note: record.note } : {}),
  ...(record.startedOn !== undefined ? { startedOn: record.startedOn } : {}),
});

/** A copy of the record without one optional field (put() then removes it from storage). */
function without(record: ItemRecord, field: 'dueDate' | 'completedAt' | 'note'): ItemRecord {
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

  /** Removes items with all their history. Call inside a transaction over all three tables. */
  async function purge(itemIds: string[]) {
    await db.completions.where('itemId').anyOf(itemIds).delete();
    await db.targetHistory.where('itemId').anyOf(itemIds).delete();
    await db.items.bulkDelete(itemIds);
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
            // Habits and goals remember the day they were added, so rates count from it.
            ...(fields.type === 'todo' ? {} : { startedOn: dayKey(new Date(now())) }),
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
        db.transaction('rw', db.lists, db.items, db.completions, db.targetHistory, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);

          const parsed = validateItemInput({ ...input, type: input.type ?? item.type });
          if (!parsed.ok) return parsed;
          const { title, listId, type, target, dueDate, note } = parsed.value;
          if (!(await db.lists.get(listId))) return err(LIST_NOT_FOUND);

          // Habits and goals come before to-dos, so crossing over joins the end of the list.
          const regrouped = (type === 'todo') !== (item.type === 'todo');
          const order = listId === item.listId && !regrouped ? item.order : await nextOrder(listId);
          // Only a to-do's due date is edited here (a habit keeps the one it had as a to-do); the
          // note is edited on any type when one is given.
          const editsNote = input.note !== undefined;
          const kept = type === 'todo' ? without(item, 'dueDate') : item;
          const record: ItemRecord = {
            ...(editsNote ? without(kept, 'note') : kept),
            type,
            title,
            listId,
            order,
            ...(dueDate !== undefined ? { dueDate } : {}),
            ...(note !== undefined ? { note } : {}),
            // A to-do becoming a habit or goal starts counting today, not from when it was a to-do.
            ...(item.type === 'todo' && type !== 'todo' ? { startedOn: dayKey(new Date(now())) } : {}),
          };
          await db.items.put(record);

          if (target !== undefined) {
            // Only the current week onwards changes; earlier weeks keep their own target.
            const week = currentWeekStart();
            const points = await db.targetHistory.where('itemId').equals(itemId).toArray();
            if (points.length === 0) {
              // Never weekly before: past check-ins count against this target too.
              const first = (await db.completions.where('itemId').equals(itemId).sortBy('dayKey'))[0];
              const start = first ? weekStartKey(first.dayKey) : week;
              await db.targetHistory.put({ itemId, effectiveWeekStart: start < week ? start : week, target });
            } else if (targetInForce(points, week) !== target) {
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

    listArchived: () =>
      guard(ITEMS_LOAD_ERROR, async () => {
        const records = await db.items.filter((item) => item.archivedAt !== undefined).toArray();
        return ok(records.map((record) => ({ ...toItem(record), archivedAt: record.archivedAt! })));
      }),

    restore: (itemId) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, db.items, async () => {
          const record = await db.items.get(itemId);
          if (!record || isActive(record)) return err(ITEM_NOT_FOUND);

          const lists = (await db.lists.toArray()).map((list) => ({ ...list, color: list.color as ListColor }));
          const target = restoreTarget({ ...toItem(record), archivedAt: record.archivedAt! }, lists);
          if (!target) return err(NO_LIST);

          const restored: ItemRecord = {
            ...record,
            listId: target.listId,
            order: await nextOrder(target.listId),
          };
          delete restored.archivedAt;
          await db.items.put(restored);
          return ok({ item: toItem(restored), movedTo: target.movedTo });
        }),
      ),

    deleteForever: (itemId) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, db.completions, db.targetHistory, async () => {
          const item = await db.items.get(itemId);
          if (!item || isActive(item)) return err(ITEM_NOT_FOUND);
          await purge([itemId]);
          return ok(undefined);
        }),
      ),

    emptyDeleted: () =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, db.completions, db.targetHistory, async () => {
          const ids = (await db.items.filter((item) => !isActive(item)).primaryKeys()) as string[];
          await purge(ids);
          return ok(ids.length);
        }),
      ),

    clearCompleted: (listId) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, async () => {
          const at = now();
          const count = await db.items
            .where('listId')
            .equals(listId)
            .filter((item) => isActive(item) && item.type === 'todo' && item.completedAt !== undefined)
            .modify({ archivedAt: at });
          return ok(count);
        }),
      ),

    moveTo: (itemId, index) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.items, async () => {
          const item = await db.items.get(itemId);
          if (!item || !isActive(item)) return err(ITEM_NOT_FOUND);
          if (item.type === 'todo') return err(TODO_ORDER);

          const siblings = await db.items.where('listId').equals(item.listId).filter(isActive).toArray();
          await db.items.bulkPut(moveRecurring(siblings, itemId, index));
          return ok(undefined);
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
