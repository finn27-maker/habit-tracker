import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createBackup, parseBackup } from '../domain/backup';
import type { IncomingTodo } from '../domain/assistant';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import { createAssistantRepo } from './assistant-repo';
import { createBackupRepo } from './backup-repo';
import { businessesOf, createDb } from './db';
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
  it('gives a new business its own 💼 blue list after the others', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);

    expect(await listOf(db, 't1')).toEqual({
      id: expect.any(String),
      name: 'Lxthr Garage',
      emoji: '💼',
      color: 'blue',
      order: 4,
      businessIds: ['lxthrgarage'],
    });
  });

  it('puts later to-dos for the business in the same list', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);
    await saveOk(repo, [todo('t2', garage)]);

    expect((await listOf(db, 't2'))!.id).toBe((await listOf(db, 't1'))!.id);
    expect(businessesOf((await listOf(db, 't2'))!)).toEqual(['lxthrgarage']);
    expect(await db.lists.count()).toBe(5);
  });

  it('adopts a list with the same name, ignoring case, instead of adding one', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', { id: 'personal', name: 'personal' })]);

    expect(await listOf(db, 't1')).toMatchObject({ id: 'list-4', name: 'Personal', businessIds: ['personal'] });
    expect(await db.lists.count()).toBe(4);
  });

  it('keeps using the list after it is renamed on the phone', async () => {
    const { db, lists, repo } = await setup();
    await saveOk(repo, [todo('t1', garage)]);
    const linked = (await listOf(db, 't1'))!;
    await lists.update(linked.id, { name: 'Garage 🚗', emoji: '🚗', color: 'orange' });
    await saveOk(repo, [todo('t2', garage)]);

    expect(await listOf(db, 't2')).toMatchObject({ id: linked.id, name: 'Garage 🚗', businessIds: ['lxthrgarage'] });
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

  it('makes the list again after the linked one was deleted', async () => {
    const { db, lists, repo } = await setup();
    const wta = { id: 'wta', name: 'WTA' };
    await saveOk(repo, [todo('t1', wta)]);
    await lists.remove((await listOf(db, 't1'))!.id);
    await saveOk(repo, [todo('t2', wta)]);

    expect(await listOf(db, 't2')).toMatchObject({ name: 'WTA', emoji: '💼', color: 'blue', businessIds: ['wta'] });
  });

  it('still uses list names, then Assistant, for to-dos with no business', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('t1', undefined, 'work'), todo('t2', undefined, 'Groceries')]);

    expect(await listOf(db, 't1')).toMatchObject({ id: 'list-2' });
    expect(businessesOf((await listOf(db, 't1'))!)).toEqual([]);
    expect(await listOf(db, 't2')).toMatchObject({ name: 'Assistant', emoji: '📥' });
  });

  it('adds no list and links nothing when the delivery cannot be saved', async () => {
    const { db, repo } = await setup();
    vi.spyOn(db.items, 'add').mockRejectedValueOnce(new Error('lost'));

    expect(
      await repo.save([todo('t1', { id: 'mwcn', name: 'Work' }), todo('t2', garage)]),
    ).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await db.lists.count()).toBe(4);
    expect(businessesOf((await db.lists.get('list-2'))!)).toEqual([]);
    expect(await db.items.count()).toBe(0);
  });
});

describe('several businesses on one list', () => {
  it('lets two businesses that name the same list share it', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('m1', { id: 'mwcn', name: 'Side Business' })]);
    await saveOk(repo, [todo('w1', { id: 'wta', name: 'Side Business' })]);

    expect(await listOf(db, 'm1')).toMatchObject({ id: 'list-3' });
    expect(await listOf(db, 'w1')).toMatchObject({ id: 'list-3' });
    expect(businessesOf((await db.lists.get('list-3'))!)).toEqual(['mwcn', 'wta']);
    expect(await db.lists.count()).toBe(4);
  });

  it('keeps both businesses on a shared list after a phone rename', async () => {
    const { db, lists, repo } = await setup();
    await saveOk(repo, [todo('m1', { id: 'mwcn', name: 'Side Business' }), todo('w1', { id: 'wta', name: 'Side Business' })]);
    await lists.update('list-3', { name: 'Boards & Councils', emoji: '🏛️', color: 'purple' });
    await saveOk(repo, [todo('m2', { id: 'mwcn', name: 'Side Business' }), todo('w2', { id: 'wta', name: 'Side Business' })]);

    expect(await listOf(db, 'm2')).toMatchObject({ id: 'list-3', name: 'Boards & Councils' });
    expect(await listOf(db, 'w2')).toMatchObject({ id: 'list-3' });
    expect(await db.lists.count()).toBe(4);
  });

  it('lists each business only once', async () => {
    const { db, repo } = await setup();
    for (let i = 0; i < 6; i++) await saveOk(repo, [todo(`m${i}`, { id: 'mwcn', name: 'Work' })]);

    expect((await db.lists.get('list-2'))!.businessIds).toEqual(['mwcn']);
  });

  it('never moves a linked business to another list by name', async () => {
    const { db, repo } = await setup();
    await saveOk(repo, [todo('k1', { id: 'keybank', name: 'Work' })]);
    await saveOk(repo, [todo('k2', { id: 'keybank', name: 'Personal' })]);

    expect(await listOf(db, 'k2')).toMatchObject({ id: 'list-2' });
    expect(businessesOf((await db.lists.get('list-4'))!)).toEqual([]);
  });

  it('reads a link saved by the previous version and adds new businesses beside it', async () => {
    const { db, repo } = await setup();
    await db.lists.update('list-3', { businessId: 'lxthrgarage' });
    await saveOk(repo, [todo('g1', garage)]);
    await saveOk(repo, [todo('g2', { id: 'garage2', name: 'Side Business' })]);

    expect(await listOf(db, 'g1')).toMatchObject({ id: 'list-3' });
    expect(await listOf(db, 'g2')).toMatchObject({ id: 'list-3' });
    expect(businessesOf((await db.lists.get('list-3'))!)).toEqual(['lxthrgarage', 'garage2']);
  });

  it('keeps every business on a shared, renamed list through a backup and restore', async () => {
    const { db, lists, repo } = await setup();
    await saveOk(repo, [todo('m1', { id: 'mwcn', name: 'Side Business' }), todo('w1', { id: 'wta', name: 'Side Business' })]);
    await lists.update('list-3', { name: 'Boards & Councils', emoji: '🏛️', color: 'purple' });

    const backups = createBackupRepo(db);
    const read = await backups.read();
    if (!read.ok) throw new Error(read.error);
    const parsed = parseBackup(JSON.stringify(createBackup(read.value, new Date())));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await backups.restore(parsed.value.data)).toEqual({ ok: true, value: undefined });
    await saveOk(repo, [todo('m2', { id: 'mwcn', name: 'Side Business' }), todo('w2', { id: 'wta', name: 'Side Business' })]);

    expect(await listOf(db, 'm2')).toMatchObject({ id: 'list-3', name: 'Boards & Councils' });
    expect(await listOf(db, 'w2')).toMatchObject({ id: 'list-3' });
    expect(await db.lists.count()).toBe(4);
  });

  it('files 50 to-dos for 10 businesses sharing the 4 lists quickly, adding none', async () => {
    const { db, repo } = await setup();
    const names = ['Fitness', 'Work', 'Side Business', 'Personal'];
    const todos = Array.from({ length: 50 }, (_, i) =>
      todo(`t${i}`, { id: `biz${i % 10}`, name: names[i % 10 % 4]! }),
    );
    const started = performance.now();
    expect(await saveOk(repo, todos)).toEqual({ ids: todos.map((t) => t.id), added: 50 });
    const elapsed = performance.now() - started;

    expect(await db.lists.count()).toBe(4);
    const linked = (await db.lists.toArray()).flatMap(businessesOf).sort();
    expect(linked).toEqual(Array.from({ length: 10 }, (_, i) => `biz${i}`).sort());
    expect(elapsed).toBeLessThan(2000);
  });
});
