import { describe, expect, it } from 'vitest';
import { fastestOf } from '../testing/timing';
import { addDaysToKey } from './dates';
import {
  BACKUP_DAMAGED,
  BACKUP_NEWER,
  BACKUP_TOO_LARGE,
  MAX_BACKUP_BYTES,
  NOT_A_BACKUP,
  REMINDER_AFTER_MS,
  SNOOZE_MS,
  backupDateLabel,
  backupFileName,
  backupReminder,
  createBackup,
  parseBackup,
  summarizeBackup,
  type BackupData,
} from './backup';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 14, 9, 0);

const data = (): BackupData => ({
  lists: [
    { id: 'l1', name: 'Fitness', emoji: '🏋️', color: 'orange', order: 0 },
    { id: 'l2', name: 'Personal', emoji: '🏠', color: 'green', order: 1 },
  ],
  items: [
    { id: 'i1', listId: 'l2', type: 'daily', title: 'Meditate', order: 0 },
    { id: 'i2', listId: 'l1', type: 'weekly', title: 'Peloton ride', order: 0 },
    { id: 'i3', listId: 'l2', type: 'todo', title: 'Call mom', order: 1, dueDate: '2026-10-20' },
    { id: 'i4', listId: 'l2', type: 'todo', title: 'Old', order: 2, completedAt: 5 },
    { id: 'i5', listId: 'l1', type: 'daily', title: 'Gone', order: 1, archivedAt: 9 },
  ],
  completions: [
    { id: 'c1', itemId: 'i1', dayKey: '2026-10-13', createdAt: 1 },
    { id: 'c2', itemId: 'i1', dayKey: '2026-10-14', createdAt: 2 },
    { id: 'c3', itemId: 'i2', dayKey: '2026-10-12', createdAt: 3 },
  ],
  targetHistory: [{ itemId: 'i2', effectiveWeekStart: '2026-10-11', target: 3 }],
});

const text = (value: unknown) => JSON.stringify(value);
const envelope = (overrides: Record<string, unknown> = {}) => ({
  ...createBackup(data(), NOW),
  ...overrides,
});
const withData = (change: (d: BackupData) => void) => {
  const d = data();
  change(d);
  return text(createBackup(d, NOW));
};

describe('createBackup', () => {
  it('wraps the data with the app name, version and export time', () => {
    const backup = createBackup(data(), NOW);
    expect(backup.app).toBe('habit-tracker');
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe(NOW.toISOString());
    expect(backup.data).toEqual(data());
  });

  it('names the file by local day', () => {
    expect(backupFileName('2026-10-14')).toBe('habit-tracker-backup-2026-10-14.json');
  });
});

describe('parseBackup', () => {
  it('round-trips a backup made here', () => {
    const backup = createBackup(data(), NOW);
    expect(parseBackup(text(backup))).toEqual({ ok: true, value: backup });
  });

  it.each([
    ['not JSON', 'hello', NOT_A_BACKUP],
    ['an array', '[]', NOT_A_BACKUP],
    ['null', 'null', NOT_A_BACKUP],
    ['another app', text(envelope({ app: 'other' })), NOT_A_BACKUP],
    ['a newer version', text(envelope({ version: 2 })), BACKUP_NEWER],
    ['a broken version', text(envelope({ version: '1' })), BACKUP_DAMAGED],
    ['version 0', text(envelope({ version: 0 })), BACKUP_DAMAGED],
    ['no export time', text(envelope({ exportedAt: 'soon' })), BACKUP_DAMAGED],
    ['no data', text(envelope({ data: null })), BACKUP_DAMAGED],
    ['data without arrays', text(envelope({ data: { lists: {} } })), BACKUP_DAMAGED],
  ])('refuses %s', (_what, input, error) => {
    expect(parseBackup(input)).toEqual({ ok: false, error });
  });

  it.each([
    ['a list without an id', (d: BackupData) => Object.assign(d.lists[0]!, { id: '' })],
    ['a list with an unknown colour', (d: BackupData) => Object.assign(d.lists[0]!, { color: 'plaid' })],
    ['a list with a text order', (d: BackupData) => Object.assign(d.lists[0]!, { order: '1' })],
    ['two lists with one id', (d: BackupData) => Object.assign(d.lists[1]!, { id: 'l1' })],
    ['an item in a missing list', (d: BackupData) => Object.assign(d.items[0]!, { listId: 'nope' })],
    ['an item of an unknown type', (d: BackupData) => Object.assign(d.items[0]!, { type: 'monthly' })],
    ['an item with no title', (d: BackupData) => Object.assign(d.items[0]!, { title: 7 })],
    ['a bad due date', (d: BackupData) => Object.assign(d.items[2]!, { dueDate: '2026-13-01' })],
    ['a text completion time', (d: BackupData) => Object.assign(d.items[3]!, { completedAt: 'x' })],
    ['a text archive time', (d: BackupData) => Object.assign(d.items[4]!, { archivedAt: 'x' })],
    ['two items with one id', (d: BackupData) => Object.assign(d.items[1]!, { id: 'i1' })],
    ['a completion on 2026-02-30', (d: BackupData) => Object.assign(d.completions[0]!, { dayKey: '2026-02-30' })],
    ['a completion for a missing item', (d: BackupData) => Object.assign(d.completions[0]!, { itemId: 'nope' })],
    ['a completion with no time', (d: BackupData) => Object.assign(d.completions[0]!, { createdAt: null })],
    ['two completions with one id', (d: BackupData) => Object.assign(d.completions[1]!, { id: 'c1' })],
    ['a target for a missing item', (d: BackupData) => Object.assign(d.targetHistory[0]!, { itemId: 'nope' })],
    ['a target of zero', (d: BackupData) => Object.assign(d.targetHistory[0]!, { target: 0 })],
    ['a target on a bad day', (d: BackupData) => Object.assign(d.targetHistory[0]!, { effectiveWeekStart: 'x' })],
    ['two targets for one week', (d: BackupData) => d.targetHistory.push({ ...d.targetHistory[0]! })],
    ['a record that is not an object', (d: BackupData) => (d.lists as unknown[]).push('x')],
  ])('calls a file with %s damaged', (_what, change) => {
    expect(parseBackup(withData(change))).toEqual({ ok: false, error: BACKUP_DAMAGED });
  });

  it('refuses a file over 20 MB before reading it', () => {
    expect(parseBackup('{}', MAX_BACKUP_BYTES + 1)).toEqual({ ok: false, error: BACKUP_TOO_LARGE });
    expect(MAX_BACKUP_BYTES).toBe(20 * 1024 * 1024);
  });

  it('keeps only the fields the app knows', () => {
    const parsed = parseBackup(
      withData((d) => {
        Object.assign(d.lists[0]!, { evil: 'x' });
        Object.assign(d.items[0]!, { evil: 'x' });
        Object.assign(d.completions[0]!, { evil: 'x' });
        Object.assign(d.targetHistory[0]!, { evil: 'x' });
      }),
    );
    expect(parsed.ok && JSON.stringify(parsed.value.data)).not.toContain('evil');
  });
});

describe('summarizeBackup', () => {
  it('counts lists, habits and goals, open and done to-dos, and check-ins, leaving out deleted items', () => {
    expect(summarizeBackup(createBackup(data(), NOW))).toEqual({
      lists: 2,
      habitsAndGoals: 2,
      todos: 2,
      checkIns: 3,
    });
  });

  it('dates a backup in words', () => {
    expect(backupDateLabel(new Date(2026, 9, 12, 20, 0).getTime())).toBe('Oct 12, 2026');
  });
});

describe('backupReminder', () => {
  const base = { lastBackupAt: null, snoozedUntil: null, hasItems: true, now: NOW.getTime() };

  it('suggests a first backup once there is something to save', () => {
    expect(backupReminder(base)).toBe('never');
    expect(backupReminder({ ...base, hasItems: false })).toBe('none');
  });

  it('reminds once the last backup is more than a week old, not before', () => {
    expect(backupReminder({ ...base, lastBackupAt: NOW.getTime() - 8 * DAY })).toBe('overdue');
    expect(backupReminder({ ...base, lastBackupAt: NOW.getTime() - 7 * DAY - 1 })).toBe('overdue');
    expect(backupReminder({ ...base, lastBackupAt: NOW.getTime() - 7 * DAY })).toBe('none');
    expect(backupReminder({ ...base, lastBackupAt: NOW.getTime() - 6 * DAY })).toBe('none');
  });

  it('snoozes for a day and reminds weekly', () => {
    expect(SNOOZE_MS).toBe(DAY);
    expect(REMINDER_AFTER_MS).toBe(7 * DAY);
  });

  it('stays quiet while snoozed', () => {
    expect(backupReminder({ ...base, snoozedUntil: NOW.getTime() + 1 })).toBe('none');
    expect(backupReminder({ ...base, snoozedUntil: NOW.getTime() })).toBe('never');
  });
});

describe('speed', () => {
  it('builds and validates three years of history in under 500 ms', () => {
    const big = data();
    for (let i = 0; i < 20000; i += 1) {
      big.completions.push({ id: `x${i}`, itemId: 'i1', dayKey: addDaysToKey('2023-10-01', i % 1100), createdAt: i });
    }
    const ms = fastestOf(3, () => {
      const file = text(createBackup(big, NOW));
      parseBackup(file);
    });
    expect(ms).toBeLessThan(500);
  });
});
