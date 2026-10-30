import { FALLBACK_LIST, matchList, type IncomingTodo } from '../domain/assistant';
import { ok, type Result } from '../domain/result';
import type { HabitDb, ItemRecord } from './db';
import { SAVE_ERROR, guard } from './errors';
import { newId as defaultNewId } from './ids';

export const ASSISTANT_LOAD_ERROR = "Couldn't read the assistant settings. Close and reopen the app.";

// Meta keys. The meta table is never exported by a backup and a restore never writes these,
// so the pairing code stays on this phone only (decision a0c65724).
const CODE = 'assistantCode';
const CONNECTED = 'assistantConnected';
const LAST_SYNC = 'assistantLastSync';

const ASSISTANT_LIST = { name: FALLBACK_LIST, emoji: '📥', color: 'blue' } as const;

export interface AssistantStatus {
  paired: boolean;
  /** False after the assistant refused the code (401) until a new one is pasted. */
  connected: boolean;
  lastSyncAt: number | null;
}

export interface SaveOutcome {
  /** Every received id now stored, new or already there: all of them can be acknowledged. */
  ids: string[];
  /** How many were new. */
  added: number;
}

export interface AssistantRepo {
  /** The stored code, or null when unpaired or storage can't be read. */
  code(): Promise<string | null>;
  pair(code: string): Promise<Result<void>>;
  unpair(): Promise<Result<void>>;
  status(): Promise<Result<AssistantStatus>>;
  markNotConnected(): Promise<void>;
  markSynced(at: number): Promise<void>;
  /** Adds each to-do once, in one transaction: all of them or none. */
  save(todos: IncomingTodo[]): Promise<Result<SaveOutcome>>;
}

export interface AssistantRepoDeps {
  newId?: () => string;
}

export function createAssistantRepo(db: HabitDb, deps: AssistantRepoDeps = {}): AssistantRepo {
  const newId = deps.newId ?? defaultNewId;

  const readCode = async () => {
    const row = await db.meta.get(CODE);
    return typeof row?.value === 'string' ? row.value : null;
  };

  /** Best effort: a status flag that fails to save is retried by the next sync. */
  const putQuietly = async (key: string, value: unknown) => {
    try {
      await db.meta.put({ key, value });
    } catch {
      // ignored on purpose
    }
  };

  async function listFor(name: string): Promise<string> {
    const lists = await db.lists.orderBy('order').toArray();
    const found = matchList(lists, name) ?? matchList(lists, FALLBACK_LIST);
    if (found) return found.id;
    const last = lists.at(-1);
    const id = newId();
    await db.lists.add({ id, ...ASSISTANT_LIST, order: last ? last.order + 1 : 0 });
    return id;
  }

  async function nextOrder(listId: string): Promise<number> {
    const siblings = await db.items.where('listId').equals(listId).toArray();
    return siblings.reduce((highest, item) => Math.max(highest, item.order), -1) + 1;
  }

  return {
    code: async () => {
      try {
        return await readCode();
      } catch {
        return null;
      }
    },

    pair: (code) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.meta, async () => {
          await db.meta.put({ key: CODE, value: code });
          await db.meta.put({ key: CONNECTED, value: true });
          await db.meta.delete(LAST_SYNC);
          return ok(undefined);
        }),
      ),

    unpair: () =>
      guard(SAVE_ERROR, async () => {
        await db.meta.bulkDelete([CODE, CONNECTED, LAST_SYNC]);
        return ok(undefined);
      }),

    status: () =>
      guard(ASSISTANT_LOAD_ERROR, async () => {
        const [code, connected, last] = await Promise.all([
          readCode(),
          db.meta.get(CONNECTED),
          db.meta.get(LAST_SYNC),
        ]);
        return ok({
          paired: code !== null,
          connected: code !== null && connected?.value === true,
          lastSyncAt: code !== null && typeof last?.value === 'number' ? last.value : null,
        });
      }),

    markNotConnected: () => putQuietly(CONNECTED, false),
    markSynced: (at) => putQuietly(LAST_SYNC, at),

    save: (todos) =>
      guard(SAVE_ERROR, () =>
        db.transaction('rw', db.lists, db.items, async () => {
          const ids: string[] = [];
          let added = 0;
          for (const todo of todos) {
            ids.push(todo.id);
            if (await db.items.where('assistantId').equals(todo.id).count()) continue;
            const listId = await listFor(todo.list);
            const record: ItemRecord = {
              id: newId(),
              listId,
              type: 'todo',
              title: todo.title,
              order: await nextOrder(listId),
              assistantId: todo.id,
              ...(todo.due ? { dueDate: todo.due } : {}),
            };
            await db.items.add(record);
            added++;
          }
          return ok({ ids, added });
        }),
      ),
  };
}
