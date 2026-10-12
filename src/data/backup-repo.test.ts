import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, type BackupData } from '../domain/backup';
import { addDaysToKey } from '../domain/dates';
import { BACKUP_READ_ERROR, createBackupRepo } from './backup-repo';
import { createDb } from './db';
import { SAVE_ERROR } from './errors';
import { createItemsRepo } from './items-repo';
import { createListsRepo } from './lists-repo';

let dbCounter = 0;
const NOW = new Date(2026, 9, 14, 9, 0).getTime();

async function setup() {
  const db = createDb(`backup-repo-${++dbCounter}`);
  let n = 0;
  const lists = createListsRepo(db, { newId: () => `list-${++n}` });
  const items = createItemsRepo(db, { newId: () => `id-${++n}`, now: () => NOW });
  const backup = createBackupRepo(db);
  await lists.ensureStarterLists();
  return { db, lists, items, backup };
}

const restored: BackupData = {
  lists: [{ id: 'r1', name: 'Reading', emoji: '📚', color: 'teal', order: 0 }],
  items: [
    { id: 'h1', listId: 'r1', type: 'daily', title: 'Read', order: 0 },
    { id: 'g1', listId: 'r1', type: 'weekly', title: 'Library', order: 1, archivedAt: 7 },
  ],
  completions: [{ id: 'c1', itemId: 'h1', dayKey: '2026-10-13', createdAt: 1 }],
  targetHistory: [{ itemId: 'g1', effectiveWeekStart: '2026-10-11', target: 2 }],
};

describe('read', () => {
  it('returns every list, item (archived too), completion and target record', async () => {
    const { items, backup, db } = await setup();
    await items.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    await items.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
    await items.toggleDay('id-5', '2026-10-14');
    await items.archive('id-5');

    const result = await backup.read();
    expect(result.ok).toBe(true);
    const data = result.ok ? result.value : restored;
    expect(data.lists.map((list) => list.name)).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
    expect(data.items.map((item) => [item.title, item.archivedAt])).toEqual([
      ['Meditate', NOW],
      ['Peloton ride', undefined],
    ]);
    expect(data.completions).toHaveLength(1);
    expect(data.targetHistory).toEqual([{ itemId: 'id-6', effectiveWeekStart: '2026-10-11', target: 3 }]);
    expect(await db.meta.count()).toBe(1); // reading writes nothing
  });

  it('reports a storage failure', async () => {
    const { backup, db } = await setup();
    db.close();
    expect(await backup.read()).toEqual({ ok: false, error: BACKUP_READ_ERROR });
  });
});

describe('restore', () => {
  it('replaces everything with the backup and keeps the starters from coming back', async () => {
    const { items, backup, lists } = await setup();
    await items.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });

    expect(await backup.restore(restored)).toEqual({ ok: true, value: undefined });

    const after = await backup.read();
    expect(after.ok && after.value).toEqual(restored);
    await lists.ensureStarterLists();
    const all = await lists.getAll();
    expect(all.ok && all.value.map((list) => list.name)).toEqual(['Reading']);
  });

  it('keeps the old data when the restore fails', async () => {
    const { items, backup, db } = await setup();
    await items.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    // A completion id that clashes inside the backup makes the bulk add fail mid-transaction.
    const clash: BackupData = {
      ...restored,
      completions: [restored.completions[0]!, { ...restored.completions[0]! }],
    };

    expect(await backup.restore(clash)).toEqual({ ok: false, error: SAVE_ERROR });
    expect((await db.items.toArray()).map((item) => item.title)).toEqual(['Meditate']);
    expect(await db.lists.count()).toBe(4);
  });

  it('leaves this phone’s backup date and reminder settings alone', async () => {
    const { backup } = await setup();
    await backup.markBackedUp(5);
    await backup.snooze(9);
    await backup.restore(restored);
    expect(await backup.status()).toEqual({ ok: true, value: { lastBackupAt: 5, snoozedUntil: 9 } });
  });
});

describe('round trip', () => {
  it('restores an exported file to an identical copy on a fresh install', async () => {
    const { items, backup } = await setup();
    await items.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    await items.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
    await items.update('id-6', { title: 'Peloton ride', listId: 'list-1', target: 4 });
    await items.create({ title: 'Call mom', listId: 'list-4', type: 'todo', dueDate: '2026-10-20' });
    await items.create({ title: 'Old chore', listId: 'list-4', type: 'todo' });
    await items.setTodoDone('id-8', true);
    await items.toggleDay('id-5', '2026-10-13');
    await items.addCompletion('id-6', '2026-10-12');
    await items.archive('id-5');
    const original = await backup.read();
    const file = JSON.stringify(createBackup(original.ok ? original.value : restored, new Date(NOW)));

    const fresh = createBackupRepo(createDb(`backup-repo-${++dbCounter}`));
    const parsed = parseBackup(file);
    expect(parsed.ok && (await fresh.restore(parsed.value.data))).toEqual({ ok: true, value: undefined });
    expect(await fresh.read()).toEqual(original);
  });

  it('restores three years of history in under 3 seconds', async () => {
    const { backup } = await setup();
    const big: BackupData = {
      ...restored,
      completions: Array.from({ length: 20000 }, (_, i) => ({
        id: `x${i}`,
        itemId: 'h1',
        dayKey: addDaysToKey('2023-10-01', i % 1100),
        createdAt: i,
      })),
    };
    const started = performance.now();
    expect(await backup.restore(big)).toEqual({ ok: true, value: undefined });
    expect(performance.now() - started).toBeLessThan(3000);
  });
});

describe('status', () => {
  it('starts with no backup and no snooze, then remembers both', async () => {
    const { backup } = await setup();
    expect(await backup.status()).toEqual({ ok: true, value: { lastBackupAt: null, snoozedUntil: null } });
    expect(await backup.markBackedUp(NOW)).toEqual({ ok: true, value: undefined });
    expect(await backup.snooze(NOW + 1)).toEqual({ ok: true, value: undefined });
    expect(await backup.status()).toEqual({
      ok: true,
      value: { lastBackupAt: NOW, snoozedUntil: NOW + 1 },
    });
  });

  it('reports storage failures', async () => {
    const { backup, db } = await setup();
    db.close();
    expect(await backup.status()).toEqual({ ok: false, error: BACKUP_READ_ERROR });
    expect(await backup.markBackedUp(NOW)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await backup.snooze(NOW)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await backup.restore(restored)).toEqual({ ok: false, error: SAVE_ERROR });
  });
});
