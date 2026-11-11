import Dexie, { type EntityTable } from 'dexie';

export interface ListRecord {
  id: string;
  name: string;
  emoji: string;
  color: string;
  order: number;
  /** The Scribe businesses whose assistant to-dos land here. Not indexed, so no schema change. */
  businessIds?: string[];
  /** The single business link saved before lists could be shared; read via businessesOf. */
  businessId?: string;
}

/** Every Scribe business a list belongs to, including a link saved by the previous version. */
export function businessesOf(list: Pick<ListRecord, 'businessIds' | 'businessId'>): string[] {
  const ids = [...(list.businessIds ?? []), ...(list.businessId ? [list.businessId] : [])];
  return [...new Set(ids)];
}

export interface ItemRecord {
  id: string;
  listId: string;
  type: 'daily' | 'weekly' | 'todo';
  title: string;
  order: number;
  /** Set when archived (e.g. its list was deleted); history is kept. */
  archivedAt?: number;
  /** To-dos only: local day it is due, YYYY-MM-DD. Not indexed, so no schema change. */
  dueDate?: string;
  /** To-dos only: when it was checked off. */
  completedAt?: number;
  /** To-dos from the owner's assistant: its id, so the same to-do is never added twice. */
  assistantId?: string;
  /** A short note on any item. Not indexed, so no schema change. */
  note?: string;
  /** Habits and goals: local day it was added (or became one). Not indexed. */
  startedOn?: string;
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
  // v2 indexes assistantId (assistant to-dos). Existing rows have none, so no upgrade() is needed.
  db.version(2).stores({
    items: 'id, listId, archivedAt, assistantId',
  });
  return db;
}
