import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createBackup, parseBackup } from '../domain/backup';
import type { IncomingTodo } from '../domain/assistant';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import { createAssistantRepo } from './assistant-repo';
import { createBackupRepo } from './backup-repo';
import { createDb } from './db';
import { SAVE_ERROR } from './errors';
import { createListsRepo } from './lists-repo';

let dbCounter = 0;

/** Fixture lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function setup() {
  const db = createDb(`business-lists-${++dbCounter}`);
  let n = 0;
  const lists = createListsRepo(db, { newId: () => `list-${++n}`, starters: FIXTURE_LISTS });
  const repo = createAssistantRepo(db, { newId: () => `new-${++n}` });
  await lists.ensureStarterLists();
  return { db, lists, repo };
}

const todo = (id: string, business?: { id: string; name: string }, list = ''): IncomingTodo => ({
  id,
  title: `To-do ${id}`,
  list,
  due: undefined,
  ...(business ? { business } : {}),
});
const garage = { id: 'lxthrgarage', name: 'Lxthr Garage' };

async function saveOk(repo: ReturnType<typeof createAssistantRepo>, todos: IncomingTodo[]) {
  const result = await repo.save(todos);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const listOf = async (db: ReturnType<typeof createDb>, assistantId: string) => {
  const item = await db.items.where('assistantId').equals(assistantId).first();
  return db.lists.get(item!.listId);
};

describe('lists for Scribe businesses', () => {
  it('gives a new business its own 💼 blue list after the others, linked to its id', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);

    expect(await listOf(db, 't1')).toEqual({
      id: expect.any(String),
      name: 'Lxthr Garage',
      emoji: '💼',
      color: 'blue',
      order: 4,
      businessId: 'lxthrgarage',
    });
  });

  it('puts later to-dos for the business in the same list', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);
    await saveOk(repo, [todo('t2', garage)]);

    expect((await listOf(db, 't2'))!.id).toBe((await listOf(db, 't1'))!.id);
    expect(await db.lists.filter((list) => list.businessId === 'lxthrgarage').count()).toBe(1);
  });

  it('adopts an unlinked list with the same name, ignoring case, instead of adding one', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', { id: 'personal', name: 'personal' })]);

    expect(await listOf(db, 't1')).toMatchObject({ id: 'list-4', name: 'Personal', businessId: 'personal' });
    expect(await db.lists.count()).toBe(4);
  });

  it('keeps using the list after it is renamed on the phone', async () => {
    const { db, lists, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);
    const linked = (await listOf(db, 't1'))!;
    await lists.update(linked.id, { name: 'Garage 🚗', emoji: '🚗', color: 'orange' });
    await saveOk(repo, [todo('t2', garage)]);

    expect(await listOf(db, 't2')).toMatchObject({ id: linked.id, name: 'Garage 🚗', businessId: 'lxthrgarage' });
    expect(await db.lists.count()).toBe(5);
  });

  it('keeps the same list, and its name, when the business is renamed in Scribe', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);
    await saveOk(repo, [todo('t2', { id: 'lxthrgarage', name: 'Lxthr Garage LLC' })]);

    expect(await listOf(db, 't2')).toMatchObject({ name: 'Lxthr Garage' });
    expect(await db.lists.count()).toBe(5);
  });

  it('shares one new list between to-dos for the same business in one delivery', async () => {
    const { db, repo } = await setup();
    const wta = { id: 'wta', name: 'WTA' };
    await saveOk(repo, [todo('a', wta), todo('b', wta)]);

    expect(await db.lists.filter((list) => list.name === 'WTA').count()).toBe(1);
    expect((await listOf(db, 'a'))!.id).toBe((await listOf(db, 'b'))!.id);
  });

  it('does not take a same-named list that is linked to another business', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', { id: 'keybank', name: 'Work' })]);
    await saveOk(repo, [todo('t2', { id: 'work2', name: 'Work' })]);

    expect(await listOf(db, 't1')).toMatchObject({ id: 'list-2', businessId: 'keybank' });
    expect(await listOf(db, 't2')).toMatchObject({ name: 'Work', emoji: '💼', businessId: 'work2' });
    expect((await listOf(db, 't2'))!.id).not.toBe('list-2');
  });

  it('makes the list again after the linked one was deleted', async () => {
    const { db, lists, repo } = await setup();
    const wta = { id: 'wta', name: 'WTA' };
    await saveOk(repo, [todo('t1', wta)]);
    await lists.remove((await listOf(db, 't1'))!.id);
    await saveOk(repo, [todo('t2', wta)]);

    expect(await listOf(db, 't2')).toMatchObject({ name: 'WTA', emoji: '💼', color: 'blue', businessId: 'wta' });
  });

  it('still uses list names, then Assistant, for to-dos with no business', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', undefined, 'work'), todo('t2', undefined, 'Groceries')]);

    expect(await listOf(db, 't1')).toMatchObject({ id: 'list-2' });
    expect(await listOf(db, 't1')).not.toHaveProperty('businessId');
    expect(await listOf(db, 't2')).toMatchObject({ name: 'Assistant', emoji: '📥' });
  });

  it('adds no list when the delivery cannot be saved', async () => {
    const { db, repo } = await setup();
    vi.spyOn(db.items, 'add').mockRejectedValueOnce(new Error('lost'));

    expect(await repo.save([todo('t1', garage)])).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await db.lists.count()).toBe(4);
    expect(await db.items.count()).toBe(0);
  });

  it('keeps the link through a backup and restore', async () => {
    const { db, lists, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);
    const linked = (await listOf(db, 't1'))!;
    await lists.update(linked.id, { name: 'Garage 🚗', emoji: '🚗', color: 'orange' });

    const backups = createBackupRepo(db);
    const read = await backups.read();
    if (!read.ok) throw new Error(read.error);
    const parsed = parseBackup(JSON.stringify(createBackup(read.value, new Date())));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await backups.restore(parsed.value.data)).toEqual({ ok: true, value: undefined });
    await saveOk(repo, [todo('t2', garage)]);

    expect(await listOf(db, 't2')).toMatchObject({ id: linked.id, name: 'Garage 🚗' });
    expect(await db.lists.count()).toBe(5);
  });

  it('files 50 to-dos for 10 new businesses into 10 lists quickly', async () => {
    const { db, repo } = await setup();
    const todos = Array.from({ length: 50 }, (_, i) =>
      todo(`t${i}`, { id: `biz${i % 10}`, name: `Business ${i % 10}` }),
    );
    const started = performance.now();
    expect(await saveOk(repo, todos)).toEqual({ ids: todos.map((t) => t.id), added: 50 });
    const elapsed = performance.now() - started;

    expect(await db.lists.filter((list) => list.businessId !== undefined).count()).toBe(10);
    expect(elapsed).toBeLessThan(2000);
  });
});
