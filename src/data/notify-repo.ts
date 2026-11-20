import type { NotifyTodo } from '../domain/notify';
import { ok, type Result } from '../domain/result';
import type { HabitDb } from './db';
import { SAVE_ERROR, guard } from './errors';

export const NOTIFY_LOAD_ERROR = "Couldn't read the notification settings. Close and reopen the app.";

// Meta keys: like the pairing code, never exported by a backup or written by a restore.
const ON = 'notificationsOn';
/** The last due days (and time zone) the assistant accepted, so unchanged ones aren't resent. */
const SENT = 'notificationsSentDays';

export interface NotifyRepo {
  isOn(): Promise<Result<boolean>>;
  setOn(on: boolean): Promise<Result<void>>;
  /** What was last sent, as an opaque string, or null. */
  sent(): Promise<Result<string | null>>;
  markSent(value: string): Promise<Result<void>>;
  /** Every to-do on the phone, for working out due days and the morning summary. */
  todos(): Promise<Result<NotifyTodo[]>>;
}

export function createNotifyRepo(db: HabitDb): NotifyRepo {
  return {
    isOn: () => guard(NOTIFY_LOAD_ERROR, async () => ok((await db.meta.get(ON))?.value === true)),

    // Turning off forgets what was sent, so turning on again sends the days afresh.
    setOn: (on) =>
      guard(SAVE_ERROR, async () => {
        if (on) await db.meta.put({ key: ON, value: true });
        else await db.meta.bulkDelete([ON, SENT]);
        return ok(undefined);
      }),

    sent: () =>
      guard(NOTIFY_LOAD_ERROR, async () => {
        const value = (await db.meta.get(SENT))?.value;
        return ok(typeof value === 'string' ? value : null);
      }),

    markSent: (value) =>
      guard(SAVE_ERROR, async () => {
        await db.meta.put({ key: SENT, value });
        return ok(undefined);
      }),

    todos: () =>
      guard(NOTIFY_LOAD_ERROR, async () => ok(await db.items.filter((item) => item.type === 'todo').toArray())),
  };
}
