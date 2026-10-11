import Dexie, { type EntityTable } from 'dexie';

export interface ListRecord {
  id: string;
  name: string;
  emoji: string;
  color: string;
  order: number;
}

export interface ItemRecord {
  id: string;
  listId: string;
  type: 'daily' | 'weekly' | 'todo';
  title: string;
  order: number;
  /** Set when archived (e.g. its list was deleted); history is kept. */
  archivedAt?: number;
}

export interface CompletionRecord {
  id: string;
  itemId: string;
  /** Local calendar day, YYYY-MM-DD. Never a UTC timestamp. */
  dayKey: string;
  createdAt: number;
}

export interface TargetRecord {
  itemId: string;
  /** Local Sunday, YYYY-MM-DD, from which this weekly target applies. */
  effectiveWeekStart: string;
  target: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export type HabitDb = Dexie & {
  lists: EntityTable<ListRecord, 'id'>;
  items: EntityTable<ItemRecord, 'id'>;
  completions: EntityTable<CompletionRecord, 'id'>;
  targetHistory: EntityTable<TargetRecord, 'itemId'>;
  meta: EntityTable<MetaRecord, 'key'>;
};

/**
 * Schema v1 declares every table the later slices need. Adding or changing a table
 * later requires a new version() with an explicit upgrade, or existing data is at risk.
 */
export function createDb(name = 'habit-tracker'): HabitDb {
  const db = new Dexie(name) as HabitDb;
  db.version(1).stores({
    lists: 'id, order',
    items: 'id, listId, archivedAt',
    completions: 'id, itemId, dayKey, [itemId+dayKey]',
    targetHistory: '[itemId+effectiveWeekStart], itemId',
    meta: 'key',
  });
  return db;
}
