import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import { createAssistantRepo } from './assistant-repo';
import { createBackupRepo } from './backup-repo';
import { createDb } from './db';
import { SAVE_ERROR } from './errors';
import { createItemsRepo } from './items-repo';
import { createListsRepo } from './lists-repo';

let dbCounter = 0;
const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';

async function setup() {
  const db = createDb(`arrivals-${++dbCounter}`);
  let n = 0;
  const lists = createListsRepo(db, { newId: () => `list-${++n}`, starters: FIXTURE_LISTS });
  const items = createItemsRepo(db, { newId: () => `item-${++n}` });
  const repo = createAssistantRepo(db, { newId: () => `new-${++n}` });
  await lists.ensureStarterLists();
  await repo.pair(CODE);
  return { db, items, repo, backup: createBackupRepo(db) };
}

const todo = (id: string, title: string) => ({ id, title, list: 'Work', due: undefined });
const titles = async (repo: Awaited<ReturnType<typeof setup>>['repo']) => {
  const result = await repo.unseen();
  return result.ok ? result.value.map((item) => item.title) : result.error;
};

describe('assistant arrivals', () => {
  it('starts empty and lists saved arrivals in order, adding later ones', async () => {
    const { repo } = await setup();
    expect(await titles(repo)).toEqual([]);
    await repo.save([todo('t1', 'Pay the plumber'), todo('t2', 'Book dentist')]);
    await repo.save([todo('t3', 'Call Dave')]);
    expect(await titles(repo)).toEqual(['Pay the plumber', 'Book dentist', 'Call Dave']);
  });

  it('does not count a to-do received twice', async () => {
    const { repo } = await setup();
    await repo.save([todo('t1', 'Pay the plumber')]);
    await repo.save([todo('t1', 'Pay the plumber')]);
    expect(await titles(repo)).toEqual(['Pay the plumber']);
  });

  it('shows current names and drops deleted ones', async () => {
    const { repo, items, db } = await setup();
    await repo.save([todo('t1', 'Pay the plumber'), todo('t2', 'Book dentist')]);
    const [first, second] = await db.items.where('assistantId').anyOf(['t1', 't2']).sortBy('order');
    await items.update(first!.id, { title: 'Pay plumber invoice', listId: first!.listId });
    await items.archive(second!.id);
    expect(await titles(repo)).toEqual(['Pay plumber invoice']);
    await items.deleteForever(second!.id);
    expect(await titles(repo)).toEqual(['Pay plumber invoice']);
  });

  it('is cleared by OK and by Remove', async () => {
    const { repo } = await setup();
    await repo.save([todo('t1', 'Pay the plumber')]);
    expect(await repo.dismissUnseen()).toEqual({ ok: true, value: undefined });
    expect(await titles(repo)).toEqual([]);
    await repo.save([todo('t2', 'Book dentist')]);
    await repo.unpair();
    expect(await titles(repo)).toEqual([]);
  });

  it('records nothing when the save fails', async () => {
    const { repo, db } = await setup();
    vi.spyOn(db.items, 'add').mockRejectedValueOnce(new Error('lost'));
    expect(await repo.save([todo('t1', 'Pay the plumber')])).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await titles(repo)).toEqual([]);
  });

  it('never goes into a backup', async () => {
    const { repo, backup } = await setup();
    await repo.save([todo('t1', 'Pay the plumber')]);
    const data = await backup.read();
    expect(JSON.stringify(data)).not.toContain('assistantUnseen');
  });

  it('reports storage failures instead of throwing', async () => {
    const { repo, db } = await setup();
    db.close();
    expect((await repo.unseen()).ok).toBe(false);
    expect(await repo.dismissUnseen()).toEqual({ ok: false, error: SAVE_ERROR });
  });

  it('ignores a damaged arrivals record', async () => {
    const { repo, db } = await setup();
    await db.meta.put({ key: 'assistantUnseen', value: 'not a list' });
    expect(await titles(repo)).toEqual([]);
    await db.meta.put({ key: 'assistantUnseen', value: [42, 'nope'] });
    expect(await titles(repo)).toEqual([]);
  });
});
