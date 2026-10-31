import { isDayKey } from './dates';
import { ITEM_TYPES, type ItemType } from './items';
import { LIST_COLORS, type ListColor } from './lists';
import { err, ok, type Result } from './result';

export const BACKUP_APP = 'habit-tracker';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export const NOT_A_BACKUP = "This file isn't a Habit Tracker backup.";
export const BACKUP_NEWER = 'This backup is from a newer version of the app. Update the app first.';
export const BACKUP_DAMAGED = "This backup file is damaged and can't be restored.";
export const BACKUP_TOO_LARGE = 'This file is too large to be a Habit Tracker backup.';

const DAY = 24 * 60 * 60 * 1000;
/** Remind once the last backup is more than a week old (the user chose weekly). */
export const REMINDER_AFTER_MS = 7 * DAY;
/** "Not now" hides the reminder until the same time tomorrow. */
export const SNOOZE_MS = 1 * DAY;

export interface BackupList {
  id: string;
  name: string;
  emoji: string;
  color: ListColor;
  order: number;
}

export interface BackupItem {
  id: string;
  listId: string;
  type: ItemType;
  title: string;
  order: number;
  archivedAt?: number;
  dueDate?: string;
  completedAt?: number;
  assistantId?: string;
  note?: string;
  startedOn?: string;
}

export interface BackupCompletion {
  id: string;
  itemId: string;
  dayKey: string;
  createdAt: number;
}

export interface BackupTarget {
  itemId: string;
  effectiveWeekStart: string;
  target: number;
}

/** Everything the app stores about the user's habits, as plain records. */
export interface BackupData {
  lists: BackupList[];
  items: BackupItem[];
  completions: BackupCompletion[];
  targetHistory: BackupTarget[];
}

export interface Backup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  /** ISO time the file was made. */
  exportedAt: string;
  data: BackupData;
}

export function createBackup(data: BackupData, now: Date): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export const backupFileName = (today: string) => `habit-tracker-backup-${today}.json`;

// --- Validation: every field is checked and copied, so unknown fields never get stored. ---

type Json = Record<string, unknown>;

/** Thrown inside parsing only; parseBackup turns it into a Result. */
class Damaged extends Error {}

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function check(condition: boolean): asserts condition {
  if (!condition) throw new Damaged();
}

const text = (value: unknown, allowEmpty = true): string => {
  check(typeof value === 'string' && (allowEmpty || value !== ''));
  return value as string;
};
const id = (value: unknown) => text(value, false);
const num = (value: unknown): number => {
  check(typeof value === 'number' && Number.isFinite(value));
  return value as number;
};
const day = (value: unknown): string => {
  check(typeof value === 'string' && isDayKey(value));
  return value as string;
};
const records = (value: unknown): Json[] => {
  check(Array.isArray(value) && value.every(isObject));
  return value as Json[];
};

/** Throws if any key appears twice. */
function unique(keys: string[]) {
  check(new Set(keys).size === keys.length);
}

function readData(raw: unknown): BackupData {
  check(isObject(raw));

  const lists = records(raw.lists).map(
    (r): BackupList => {
      const color = text(r.color);
      check(color in LIST_COLORS);
      return { id: id(r.id), name: text(r.name), emoji: text(r.emoji), color: color as ListColor, order: num(r.order) };
    },
  );
  unique(lists.map((list) => list.id));
  const listIds = new Set(lists.map((list) => list.id));

  const items = records(raw.items).map((r): BackupItem => {
    const type = text(r.type);
    check(ITEM_TYPES.includes(type as ItemType));
    const listId = id(r.listId);
    check(listIds.has(listId));
    return {
      id: id(r.id),
      listId,
      type: type as ItemType,
      title: text(r.title),
      order: num(r.order),
      ...(r.archivedAt !== undefined ? { archivedAt: num(r.archivedAt) } : {}),
      ...(r.dueDate !== undefined ? { dueDate: day(r.dueDate) } : {}),
      ...(r.completedAt !== undefined ? { completedAt: num(r.completedAt) } : {}),
      ...(r.assistantId !== undefined ? { assistantId: id(r.assistantId) } : {}),
      ...(r.note !== undefined ? { note: text(r.note) } : {}),
      ...(r.startedOn !== undefined ? { startedOn: day(r.startedOn) } : {}),
    };
  });
  unique(items.map((item) => item.id));
  const itemIds = new Set(items.map((item) => item.id));

  const completions = records(raw.completions).map((r): BackupCompletion => {
    const itemId = id(r.itemId);
    check(itemIds.has(itemId));
    return { id: id(r.id), itemId, dayKey: day(r.dayKey), createdAt: num(r.createdAt) };
  });
  unique(completions.map((completion) => completion.id));

  const targetHistory = records(raw.targetHistory).map((r): BackupTarget => {
    const itemId = id(r.itemId);
    check(itemIds.has(itemId));
    const target = num(r.target);
    check(Number.isInteger(target) && target >= 1);
    return { itemId, effectiveWeekStart: day(r.effectiveWeekStart), target };
  });
  unique(targetHistory.map((point) => `${point.itemId} ${point.effectiveWeekStart}`));

  return { lists, items, completions, targetHistory };
}

/**
 * Reads a backup file's text, refusing anything that isn't exactly a backup this app can
 * restore. `size` (bytes) lets a huge file be refused before it is read.
 */
export function parseBackup(json: string, size = json.length): Result<Backup> {
  if (size > MAX_BACKUP_BYTES) return err(BACKUP_TOO_LARGE);

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return err(NOT_A_BACKUP);
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) return err(NOT_A_BACKUP);
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) return err(BACKUP_NEWER);
  if (raw.version !== BACKUP_VERSION) return err(BACKUP_DAMAGED);
  if (typeof raw.exportedAt !== 'string' || Number.isNaN(Date.parse(raw.exportedAt))) {
    return err(BACKUP_DAMAGED);
  }

  try {
    return ok({
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: raw.exportedAt,
      data: readData(raw.data),
    });
  } catch (error) {
    /* v8 ignore next -- only validation failures are thrown inside readData */
    if (!(error instanceof Damaged)) throw error;
    return err(BACKUP_DAMAGED);
  }
}

export interface BackupSummary {
  lists: number;
  habitsAndGoals: number;
  todos: number;
  checkIns: number;
}

/** What the confirmation tells the user they are about to restore (deleted items left out). */
export function summarizeBackup({ data }: Backup): BackupSummary {
  const active = data.items.filter((item) => item.archivedAt === undefined);
  return {
    lists: data.lists.length,
    habitsAndGoals: active.filter((item) => item.type !== 'todo').length,
    todos: active.filter((item) => item.type === 'todo').length,
    checkIns: data.completions.length,
  };
}

const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 12, 2026" in the phone's time zone. */
export const backupDateLabel = (time: number) => dateLabel.format(new Date(time));

export type BackupReminder = 'none' | 'never' | 'overdue';

/** Whether the Lists tab should nudge the user to back up. */
export function backupReminder(state: {
  lastBackupAt: number | null;
  snoozedUntil: number | null;
  hasItems: boolean;
  now: number;
}): BackupReminder {
  if (!state.hasItems) return 'none';
  if (state.snoozedUntil !== null && state.now < state.snoozedUntil) return 'none';
  if (state.lastBackupAt === null) return 'never';
  return state.now - state.lastBackupAt > REMINDER_AFTER_MS ? 'overdue' : 'none';
}
