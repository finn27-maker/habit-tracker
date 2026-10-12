import 'fake-indexeddb/auto';
import { createBackupRepo } from '../data/backup-repo';
import { createDb } from '../data/db';
import { createItemsRepo } from '../data/items-repo';
import { createListsRepo } from '../data/lists-repo';
import type { Clock } from '../platform/clock';
import type { InstallPrompt } from '../platform/install';
import type { ShareEnv } from '../platform/share';
import { InstallHint, type InstallHintDeps } from '../ui/install-hint.svelte';
import { FIXTURE_LISTS } from './fixture-lists';

let dbCounter = 0;

/**
 * A fresh database with repos that hand out list-1, list-2… and item-1, item-2…, and a
 * clock the test moves by hand. Defaults to Wednesday 2026-10-14 09:00.
 */
export function setupApp(start = new Date(2026, 9, 14, 9, 0), name = 'ui') {
  const db = createDb(`${name}-${++dbCounter}`);
  let l = 0;
  let i = 0;
  const listsRepo = createListsRepo(db, {
    newId: () => `list-${++l}`,
    now: () => 1_000,
    starters: FIXTURE_LISTS,
  });
  let current = start;
  // The repository reads the same clock as the screen, as in the app: weekly goals record
  // their first target in the week of "now", to-dos are stamped with it, and days after it
  // are refused.
  const itemsRepo = createItemsRepo(db, {
    newId: () => `item-${++i}`,
    now: () => current.getTime(),
  });
  let onNewDay: ((now: Date) => void) | null = null;
  let stopped = false;
  const clock: Clock = {
    now: () => current,
    watch: (callback) => {
      onNewDay = callback;
      return () => {
        stopped = true;
      };
    },
  };

  // Records what the share sheet and downloads were given, without a real browser.
  const shared: File[] = [];
  const sharedTexts: ShareData[] = [];
  const downloaded: File[] = [];
  const copied: string[] = [];
  const share = {
    canShare: (data: ShareData) => (data.files?.length ?? 0) > 0,
    share: async (data: ShareData) => {
      if (data.files) shared.push(...data.files);
      else sharedTexts.push(data);
    },
    download: (file: File) => {
      downloaded.push(file);
    },
    copyText: async (text: string) => {
      copied.push(text);
    },
  } satisfies ShareEnv;

  return {
    db,
    listsRepo,
    itemsRepo,
    backupRepo: createBackupRepo(db),
    share,
    shared,
    sharedTexts,
    downloaded,
    copied,
    /** Inside the installed app by default, so the install card stays out of other tests. */
    installHint: installHintFor({ standalone: true }).hint,
    clock,
    /** Moves the clock without telling the screen, like a stale screen after midnight. */
    setNow: (date: Date) => {
      current = date;
    },
    /** Moves the clock and delivers the new-day signal. */
    rollTo: (date: Date) => {
      current = date;
      onNewDay?.(date);
    },
    isStopped: () => stopped,
  };
}

export type AppCtx = ReturnType<typeof setupApp>;

/** Everything Router.svelte needs, from a fixture. */
export const routerProps = (ctx: AppCtx) => ({
  listsRepo: ctx.listsRepo,
  itemsRepo: ctx.itemsRepo,
  backupRepo: ctx.backupRepo,
  share: ctx.share as ShareEnv,
  clock: ctx.clock,
  installHint: ctx.installHint,
  appUrl: APP_URL,
});

export const APP_URL = 'https://finn27-maker.github.io/habit-tracker/';

/** An install card with hand-driven browser events: Chrome's prompt and "installed". */
export function installHintFor(options: Partial<InstallHintDeps> = {}) {
  let offer: ((prompt: InstallPrompt) => void) | null = null;
  let installed: (() => void) | null = null;
  const dismissals: string[] = [];
  const hint = new InstallHint({
    standalone: false,
    device: 'ios',
    isDismissed: () => false,
    markDismissed: () => {
      dismissals.push('dismissed');
    },
    onPrompt: (callback) => {
      offer = callback;
    },
    onInstalled: (callback) => {
      installed = callback;
    },
    ...options,
  });
  return {
    hint,
    dismissals,
    /** Chrome offers its prompt; the user will answer `outcome`. Returns how often it opened. */
    offerPrompt: (outcome: 'accepted' | 'dismissed') => {
      const opened = { count: 0 };
      offer?.({
        prompt: async () => {
          opened.count++;
        },
        userChoice: Promise.resolve({ outcome }),
      });
      return opened;
    },
    installFromMenu: () => installed?.(),
  };
}
