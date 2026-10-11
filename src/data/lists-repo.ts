import {
  STARTER_LISTS,
  moveInOrder,
  validateListInput,
  type Direction,
  type List,
  type ListColor,
} from '../domain/lists';
import { err, ok, type Result } from '../domain/result';
import type { HabitDb, ListRecord } from './db';
import { newId as defaultNewId } from './ids';

export const SAVE_ERROR = "Couldn't save. Your phone may be out of storage.";
export const LOAD_ERROR = "Couldn't load your lists. Close and reopen the app.";
const NOT_FOUND = 'List not found';
const STARTERS_SEEDED = 'startersSeeded';

export interface ListsRepoDeps {
  newId?: () => string;
  now?: () => number;
}

export interface ListsRepo {
  /** Creates the starter lists on the very first run only. */
  ensureStarterLists(): Promise<Result<void>>;
  getAll(): Promise<Result<List[]>>;
  create(input: { name: string; emoji: string; color: string }): Promise<Result<List>>;
  update(id: string, input: { name: string; emoji: string; color: string }): Promise<Result<List>>;
  move(id: string, direction: Direction): Promise<Result<List[]>>;
  /** Deletes the list and archives (never deletes) its items. */
  remove(id: string): Promise<Result<void>>;
  openItemCount(id: string): Promise<Result<number>>;
}

const toList = (record: ListRecord): List => ({ ...record, color: record.color as ListColor });

/** IndexedDB can fail on iOS (e.g. "Connection to Indexed Database server lost"); never throw. */
async function guard<T>(failure: string, run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch {
    return err(failure);
  }
}

export function createListsRepo(db: HabitDb, deps: ListsRepoDeps = {}): ListsRepo {
  const newId = deps.newId ?? defaultNewId;
  const now = deps.now ?? Date.now;
  const ordered = () => db.lists.orderBy('order').toArray();

  return {
    ensureStarterLists: () =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, db.meta, async () => {
          if (await db.meta.get(STARTERS_SEEDED)) return ok(undefined);
          await db.lists.bulkAdd(
            STARTER_LISTS.map((list, order) => ({ id: newId(), ...list, order })),
          );
          await db.meta.put({ key: STARTERS_SEEDED, value: true });
          return ok(undefined);
        }),
      ),

    getAll: () => guard(LOAD_ERROR, async () => ok((await ordered()).map(toList))),

    create: async (input) => {
      const parsed = validateListInput(input);
      if (!parsed.ok) return parsed;
      return guard(SAVE_ERROR, async () => {
        const last = await db.lists.orderBy('order').last();
        const record = { id: newId(), ...parsed.value, order: last ? last.order + 1 : 0 };
        await db.lists.add(record);
        return ok(toList(record));
      });
    },

    update: async (id, input) => {
      const parsed = validateListInput(input);
      if (!parsed.ok) return parsed;
      return guard(SAVE_ERROR, async () => {
        const existing = await db.lists.get(id);
        if (!existing) return err(NOT_FOUND);
        const record = { ...existing, ...parsed.value };
        await db.lists.put(record);
        return ok(toList(record));
      });
    },

    move: (id, direction) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, async () => {
          const all = await ordered();
          if (!all.some((list) => list.id === id)) return err(NOT_FOUND);
          const byId = new Map(all.map((list) => [list.id, list]));
          const reordered = moveInOrder(
            all.map((list) => list.id),
            id,
            direction,
          ).map((listId, order) => ({ ...byId.get(listId)!, order }));
          await db.lists.bulkPut(reordered);
          return ok(reordered.map(toList));
        }),
      ),

    remove: (id) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, db.items, async () => {
          if (!(await db.lists.get(id))) return err(NOT_FOUND);
          await db.items
            .where('listId')
            .equals(id)
            .filter((item) => item.archivedAt === undefined)
            .modify({ archivedAt: now() });
          await db.lists.delete(id);
          const rest = await ordered();
          await db.lists.bulkPut(rest.map((list, order) => ({ ...list, order })));
          return ok(undefined);
        }),
      ),

    openItemCount: (id) =>
      guard(LOAD_ERROR, async () =>
        ok(
          await db.items
            .where('listId')
            .equals(id)
            .filter((item) => item.archivedAt === undefined)
            .count(),
        ),
      ),
  };
}
