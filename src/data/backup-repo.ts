import type { BackupData, BackupList } from '../domain/backup';
import { ok, type Result } from '../domain/result';
import type { HabitDb } from './db';
import { SAVE_ERROR, guard } from './errors';
import { STARTERS_SEEDED } from './lists-repo';

export const BACKUP_READ_ERROR = "Couldn't prepare the backup. Close and reopen the app.";

const LAST_BACKUP_AT = 'lastBackupAt';
const BACKUP_SNOOZED_UNTIL = 'backupSnoozedUntil';

export interface BackupStatus {
  lastBackupAt: number | null;
  snoozedUntil: number | null;
}

export interface BackupRepo {
  /** Everything a backup file holds: all lists, items (archived too), completions and targets. */
  read(): Promise<Result<BackupData>>;
  /**
   * Replaces all of it with `data` in one transaction: if anything fails, nothing changes.
   * This phone's backup date and reminder snooze are kept.
   */
  restore(data: BackupData): Promise<Result<void>>;
  status(): Promise<Result<BackupStatus>>;
  markBackedUp(at: number): Promise<Result<void>>;
  snooze(until: number): Promise<Result<void>>;
}

export function createBackupRepo(db: HabitDb): BackupRepo {
  const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null);
  const setMeta = (key: string, value: number) =>
    guard(SAVE_ERROR, async () => {
      await db.meta.put({ key, value });
      return ok(undefined);
    });

  return {
    read: () =>
      guard(BACKUP_READ_ERROR, () =>
        db.transaction('r', db.lists, db.items, db.completions, db.targetHistory, async () => {
          const [lists, items, completions, targetHistory] = await Promise.all([
            db.lists.orderBy('order').toArray(),
            db.items.toArray(),
            db.completions.toArray(),
            db.targetHistory.toArray(),
          ]);
          items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
          return ok({ lists: lists as BackupList[], items, completions, targetHistory });
        }),
      ),

    restore: (data) =>
      guard(SAVE_ERROR, () =>
        db.transaction(
          'rw',
          [db.lists, db.items, db.completions, db.targetHistory, db.meta],
          async () => {
            await Promise.all([
              db.lists.clear(),
              db.items.clear(),
              db.completions.clear(),
              db.targetHistory.clear(),
            ]);
            await db.lists.bulkAdd(data.lists);
            await db.items.bulkAdd(data.items);
            await db.completions.bulkAdd(data.completions);
            await db.targetHistory.bulkAdd(data.targetHistory);
            await db.meta.put({ key: STARTERS_SEEDED, value: true });
            return ok(undefined);
          },
        ),
      ),

    status: () =>
      guard(BACKUP_READ_ERROR, async () => {
        const [last, snoozed] = await Promise.all([
          db.meta.get(LAST_BACKUP_AT),
          db.meta.get(BACKUP_SNOOZED_UNTIL),
        ]);
        return ok({
          lastBackupAt: numberOrNull(last?.value),
          snoozedUntil: numberOrNull(snoozed?.value),
        });
      }),

    markBackedUp: (at) => setMeta(LAST_BACKUP_AT, at),
    snooze: (until) => setMeta(BACKUP_SNOOZED_UNTIL, until),
  };
}
