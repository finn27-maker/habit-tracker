import type { BackupRepo } from '../data/backup-repo';
import {
  BACKUP_TOO_LARGE,
  MAX_BACKUP_BYTES,
  SNOOZE_MS,
  backupDateLabel,
  backupFileName,
  backupReminder,
  createBackup,
  parseBackup,
  summarizeBackup,
  type Backup,
  type BackupSummary,
} from '../domain/backup';
import { dayKey } from '../domain/dates';
import type { Clock } from '../platform/clock';
import { saveFile, type ShareEnv } from '../platform/share';

export interface BackupDeps {
  repo: BackupRepo;
  share: ShareEnv;
  clock: Clock;
}

/**
 * The Backup section and reminder banner's state. The file is built ahead of time because
 * the share sheet only opens straight from a tap, not after waiting on storage.
 */
export class BackupState {
  file = $state<File | null>(null);
  lastBackupAt = $state<number | null>(null);
  snoozedUntil = $state<number | null>(null);
  hasItems = $state(false);
  notice = $state('');
  /**
   * A chosen file waiting for the user to confirm the replace. Raw, not deeply reactive:
   * IndexedDB can't store Svelte's proxies, and nothing edits it.
   */
  pending = $state.raw<{ backup: Backup; summary: BackupSummary } | null>(null);
  /** Goes up after each restore so screens can reload what is stored. */
  restores = $state(0);
  /** True while a restore is being written: a big backup can take a few seconds. */
  restoring = $state(false);

  readonly reminder = $derived(
    backupReminder({
      lastBackupAt: this.lastBackupAt,
      snoozedUntil: this.snoozedUntil,
      hasItems: this.hasItems,
      now: this.#now(),
    }),
  );

  readonly #deps: BackupDeps;

  constructor(deps: BackupDeps) {
    this.#deps = deps;
  }

  #now() {
    return this.#deps.clock.now().getTime();
  }

  /** Reads the backup date and builds a fresh file from what is stored now. */
  async load() {
    const status = await this.#deps.repo.status();
    if (status.ok) {
      this.lastBackupAt = status.value.lastBackupAt;
      this.snoozedUntil = status.value.snoozedUntil;
    }
    await this.#prepare();
  }

  async #prepare() {
    const read = await this.#deps.repo.read();
    if (!read.ok) {
      this.file = null;
      this.notice = read.error;
      return;
    }
    const now = this.#deps.clock.now();
    const json = JSON.stringify(createBackup(read.value, now));
    this.file = new File([json], backupFileName(dayKey(now)), { type: 'application/json' });
    this.hasItems = read.value.items.some((item) => item.archivedAt === undefined);
  }

  /** Hands the file to the share sheet (or a download); a cancelled sheet is not a backup. */
  async export() {
    if (!this.file) return;
    const outcome = await saveFile(this.file, this.#deps.share);
    if (outcome === 'cancelled') return;
    const at = this.#now();
    const saved = await this.#deps.repo.markBackedUp(at);
    if (saved.ok) this.lastBackupAt = at;
    else this.notice = saved.error;
  }

  /** Reads and checks a chosen file; a good one waits for confirmation. */
  async choose(file: File) {
    this.notice = '';
    if (file.size > MAX_BACKUP_BYTES) {
      this.notice = BACKUP_TOO_LARGE;
      return;
    }
    const parsed = parseBackup(await file.text(), file.size);
    if (!parsed.ok) {
      this.notice = parsed.error;
      return;
    }
    this.pending = { backup: parsed.value, summary: summarizeBackup(parsed.value) };
  }

  cancelRestore() {
    this.pending = null;
  }

  async confirmRestore() {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.restoring = true;
    this.notice = 'Restoring…';
    const restored = await this.#deps.repo.restore(pending.backup.data);
    this.restoring = false;
    if (!restored.ok) {
      this.notice = restored.error;
      return;
    }
    this.notice = `Restored the backup from ${backupDateLabel(Date.parse(pending.backup.exportedAt))}.`;
    this.restores += 1;
    await this.#prepare();
  }

  /** "Not now": hide the reminder for a week. */
  async snooze() {
    const until = this.#now() + SNOOZE_MS;
    const saved = await this.#deps.repo.snooze(until);
    if (saved.ok) this.snoozedUntil = until;
    else this.notice = saved.error;
  }
}

/** The confirmation text for a chosen backup. */
export function restoreMessage({ backup, summary }: { backup: Backup; summary: BackupSummary }) {
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return (
    `Replace everything on this phone with the backup from ${backupDateLabel(Date.parse(backup.exportedAt))}? ` +
    `It has ${plural(summary.lists, 'list', 'lists')}, ` +
    `${plural(summary.habitsAndGoals, 'habit or goal', 'habits and goals')}, ` +
    `${plural(summary.todos, 'to-do', 'to-dos')} and ` +
    `${plural(summary.checkIns, 'check-in', 'check-ins')}. ` +
    `What's on this phone now will be lost.`
  );
}
