import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { createBackup, parseBackup } from '../domain/backup';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import { createAssistantRepo } from './assistant-repo';
import { createBackupRepo } from './backup-repo';
import { createDb } from './db';
import { SAVE_ERROR } from './errors';
import { createItemsRepo } from './items-repo';
import { createListsRepo } from './lists-repo';

let dbCounter = 0;
const NOW = new Date(2026, 9, 30, 9, 0).getTime();
const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';

/** Starter lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function setup() {
  const db = createDb(`assistant-repo-${++dbCounter}`);
  let n = 0;
  const lists = createListsRepo(db, { newId: () => `list-${++n}`, starters: FIXTURE_LISTS });
  const items = createItemsRepo(db, { newId: () => `item-${++n}`, now: () => NOW });
  const repo = createAssistantRepo(db, { newId: () => `new-${++n}`, now: () => NOW });
  await lists.ensureStarterLists();
  return { db, lists, items, repo };
}

const incoming = (id: string, list = 'Work', due: string | undefined = '2026-11-03') => ({
  id,
  title: `To-do ${id}`,
  list,
  due,
});

describe('pairing', () => {
  it('starts unpaired', async () => {
    const { repo } = await setup();
    expect(await repo.code()).toBeNull();
    expect(await repo.status()).toEqual({ ok: true, value: { paired: false, connected: false, lastSyncAt: null } });
  });

  it('stores the code and reports connected', async () => {
    const { repo } = await setup();
    expect(await repo.pair(CODE)).toEqual({ ok: true, value: undefined });
    expect(await repo.code()).toBe(CODE);
    expect(await repo.status()).toEqual({ ok: true, value: { paired: true, connected: true, lastSyncAt: null } });
  });

  it('records the last sync and a lost connection, and pairing again reconnects', async () => {
    const { repo } = await setup();
    await repo.pair(CODE);
    await repo.markSynced(NOW + 5);
    expect(await repo.status()).toMatchObject({ value: { lastSyncAt: NOW + 5 } });
    await repo.markNotConnected();
    expect(await repo.status()).toMatchObject({ value: { paired: true, connected: false } });
    await repo.pair(CODE);
    expect(await repo.status()).toMatchObject({ value: { paired: true, connected: true, lastSyncAt: null } });
  });

  it('Remove forgets the code and the status', async () => {
    const { repo } = await setup();
    await repo.pair(CODE);
    await repo.markSynced(NOW);
    expect(await repo.unpair()).toEqual({ ok: true, value: undefined });
    expect(await repo.code()).toBeNull();
    expect(await repo.status()).toEqual({ ok: true, value: { paired: false, connected: false, lastSyncAt: null } });
  });

  it('reports storage failures instead of throwing', async () => {
    const { db, repo } = await setup();
    vi.spyOn(db.meta, 'get').mockRejectedValue(new Error('Connection to Indexed Database server lost'));
    vi.spyOn(db.meta, 'put').mockRejectedValue(new Error('lost'));
    vi.spyOn(db.meta, 'bulkDelete').mockRejectedValue(new Error('lost'));
    expect(await repo.code()).toBeNull();
    expect((await repo.status()).ok).toBe(false);
    expect(await repo.pair(CODE)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await repo.unpair()).toEqual({ ok: false, error: SAVE_ERROR });
    await expect(repo.markSynced(NOW)).resolves.toBeUndefined();
    await expect(repo.markNotConnected()).resolves.toBeUndefined();
  });
});

describe('the pairing code and backups (family safety)', () => {
  it('is never written into a backup', async () => {
    const { db, repo } = await setup();
    await repo.pair(CODE);
    const data = await createBackupRepo(db).read();
    expect(data.ok).toBe(true);
    expect(JSON.stringify(data)).not.toContain(CODE);
  });

  it('is never changed by restoring a backup, even one with extra sections', async () => {
    const { db, repo } = await setup();
    await repo.pair(CODE);
    const file = JSON.stringify({
      ...createBackup({ lists: [], items: [], completions: [], targetHistory: [] }, new Date(NOW)),
      meta: [{ key: 'assistantCode', value: 'x'.repeat(43) }],
    });
    const parsed = parseBackup(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(await createBackupRepo(db).restore(parsed.value.data)).toEqual({ ok: true, value: undefined });
    expect(await repo.code()).toBe(CODE);
    expect(await repo.status()).toMatchObject({ value: { connected: true } });
  });

  it("keeps a received to-do's assistant id through a backup and restore", async () => {
    const { db, repo } = await setup();
    await repo.save([incoming('t1')]);
    const read = await createBackupRepo(db).read();
    if (!read.ok) throw new Error(read.error);
    const parsed = parseBackup(JSON.stringify(createBackup(read.value, new Date(NOW))));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.data.items.find((item) => item.assistantId === 't1')).toBeDefined();
  });
});

describe('saving received to-dos', () => {
  it('adds a to-do to the list with the matching name, after its other to-dos', async () => {
    const { db, items, repo } = await setup();
    await items.create({ title: 'Existing', listId: 'list-2', type: 'todo' });
    const result = await repo.save([incoming('t1', ' work ')]);
    expect(result).toEqual({ ok: true, value: { ids: ['t1'], added: 1 } });
    const saved = await db.items.where('assistantId').equals('t1').first();
    expect(saved).toMatchObject({
      listId: 'list-2',
      type: 'todo',
      title: 'To-do t1',
      dueDate: '2026-11-03',
      assistantId: 't1',
    });
    const existing = await db.items.where('listId').equals('list-2').first();
    expect(saved!.order).toBeGreaterThan(existing!.order);
  });

  it('leaves out the due date when there is none', async () => {
    const { db, repo } = await setup();
    await repo.save([incoming('t1', 'Work', undefined)]);
    const saved = await db.items.where('assistantId').equals('t1').first();
    expect(saved).not.toHaveProperty('dueDate');
  });

  it('creates one Assistant list for to-dos with no or unknown list', async () => {
    const { db, lists, repo } = await setup();
    const result = await repo.save([incoming('t1', ''), incoming('t2', 'Groceries')]);
    expect(result).toEqual({ ok: true, value: { ids: ['t1', 't2'], added: 2 } });
    const all = await lists.getAll();
    if (!all.ok) throw new Error(all.error);
    const assistant = all.value.filter((list) => list.name === 'Assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0]!.order).toBe(all.value.length - 1);
    expect(await db.items.where('listId').equals(assistant[0]!.id).count()).toBe(2);
  });

  it('reuses an existing Assistant list', async () => {
    const { lists, repo } = await setup();
    await lists.create({ name: 'assistant', emoji: '📥', color: 'blue' });
    await repo.save([incoming('t1', '')]);
    const all = await lists.getAll();
    if (!all.ok) throw new Error(all.error);
    expect(all.value.filter((list) => list.name.toLowerCase() === 'assistant')).toHaveLength(1);
  });

  it('never adds the same to-do twice, but still reports its id to acknowledge', async () => {
    const { db, repo } = await setup();
    await repo.save([incoming('t1')]);
    expect(await repo.save([incoming('t1'), incoming('t2')])).toEqual({
      ok: true,
      value: { ids: ['t1', 't2'], added: 1 },
    });
    expect(await db.items.where('assistantId').equals('t1').count()).toBe(1);
  });

  it('saves nothing for an empty batch', async () => {
    const { repo } = await setup();
    expect(await repo.save([])).toEqual({ ok: true, value: { ids: [], added: 0 } });
  });

  it('saves all or nothing, and reports a failure', async () => {
    const { db, repo } = await setup();
    vi.spyOn(db.items, 'add').mockRejectedValueOnce(new Error('lost'));
    expect(await repo.save([incoming('t1')])).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await db.items.where('assistantId').equals('t1').count()).toBe(0);
  });
});

describe('upgrading an existing phone', () => {
  it('keeps every item from the version 1 database and can look up assistant ids', async () => {
    const name = `assistant-upgrade-${++dbCounter}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      lists: 'id, order',
      items: 'id, listId, archivedAt',
      completions: 'id, itemId, dayKey, [itemId+dayKey]',
      targetHistory: '[itemId+effectiveWeekStart], itemId',
      meta: 'key',
    });
    await v1.table('lists').add({ id: 'l1', name: 'Work', emoji: '💼', color: 'blue', order: 0 });
    await v1.table('items').add({ id: 'i1', listId: 'l1', type: 'daily', title: 'Stretch', order: 0 });
    v1.close();

    const db = createDb(name);
    expect(db.verno).toBe(2);
    expect(await db.items.get('i1')).toMatchObject({ title: 'Stretch' });
    expect(await db.items.where('assistantId').equals('x').count()).toBe(0);
  });
});
