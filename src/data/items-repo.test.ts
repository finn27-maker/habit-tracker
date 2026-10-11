import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDb } from './db';
import { ITEMS_LOAD_ERROR, createItemsRepo } from './items-repo';
import { SAVE_ERROR, createListsRepo } from './lists-repo';

let dbCounter = 0;

async function setup() {
  const db = createDb(`items-repo-${++dbCounter}`);
  let l = 0;
  let i = 0;
  const lists = createListsRepo(db, { newId: () => `list-${++l}` });
  const items = createItemsRepo(db, { newId: () => `item-${++i}`, now: () => 7_000 });
  await lists.ensureStarterLists(); // list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal
  return { db, lists, items };
}

const meditate = { title: 'Meditate', listId: 'list-4', type: 'daily' };

describe('create', () => {
  it('stores a trimmed habit at the end of its list', async () => {
    const { items } = await setup();
    expect(await items.create({ ...meditate, title: '  Meditate ' })).toEqual({
      ok: true,
      value: { id: 'item-1', listId: 'list-4', type: 'daily', title: 'Meditate', order: 0 },
    });
    const second = await items.create({ ...meditate, title: 'Read' });
    expect(second.ok && second.value.order).toBe(1);
    const other = await items.create({ ...meditate, listId: 'list-1', title: 'Run' });
    expect(other.ok && other.value.order).toBe(0);
  });

  it('rejects invalid input without writing', async () => {
    const { items, db } = await setup();
    expect(await items.create({ ...meditate, title: ' ' })).toEqual({
      ok: false,
      error: "Name can't be empty",
    });
    expect(await db.items.count()).toBe(0);
  });

  it('refuses a list that does not exist', async () => {
    const { items } = await setup();
    expect(await items.create({ ...meditate, listId: 'gone' })).toEqual({
      ok: false,
      error: 'List not found',
    });
  });

  it('continues the order after archived habits are ignored', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    await db.items.update('item-1', { archivedAt: 1 });
    const next = await items.create({ ...meditate, title: 'Read' });
    expect(next.ok && next.value.order).toBe(0);
  });
});

describe('listActive', () => {
  it('returns habits ordered by order and leaves out archived ones', async () => {
    const { items, db } = await setup();
    await items.create({ ...meditate, title: 'A' });
    await items.create({ ...meditate, title: 'B' });
    await items.create({ ...meditate, title: 'C' });
    await db.items.update('item-1', { order: 5 });
    await db.items.update('item-3', { archivedAt: 1 });

    const result = await items.listActive();
    expect(result.ok && result.value.map((item) => item.title)).toEqual(['B', 'A']);
  });

  it('returns plain items without storage-only fields', async () => {
    const { items } = await setup();
    await items.create(meditate);
    const result = await items.listActive();
    expect(result.ok && Object.keys(result.value[0]!).sort()).toEqual([
      'id',
      'listId',
      'order',
      'title',
      'type',
    ]);
  });
});

describe('toggleDay', () => {
  it('adds a completion, then removes it on the next toggle', async () => {
    const { items, db } = await setup();
    await items.create(meditate);

    expect(await items.toggleDay('item-1', '2026-10-14')).toEqual({ ok: true, value: true });
    expect(await db.completions.toArray()).toEqual([
      { id: 'item-2', itemId: 'item-1', dayKey: '2026-10-14', createdAt: 7_000 },
    ]);

    expect(await items.toggleDay('item-1', '2026-10-14')).toEqual({ ok: true, value: false });
    expect(await db.completions.count()).toBe(0);
  });

  it('keeps days independent of each other', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    await items.toggleDay('item-1', '2026-10-13');
    await items.toggleDay('item-1', '2026-10-14');
    await items.toggleDay('item-1', '2026-10-13');
    expect((await db.completions.toArray()).map((c) => c.dayKey)).toEqual(['2026-10-14']);
  });

  it('leaves a consistent record after two simultaneous taps', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    const results = await Promise.all([
      items.toggleDay('item-1', '2026-10-14'),
      items.toggleDay('item-1', '2026-10-14'),
    ]);
    expect(results).toEqual([
      { ok: true, value: true },
      { ok: true, value: false },
    ]);
    expect(await db.completions.count()).toBe(0);
  });

  it('refuses unknown or archived habits and invalid days', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    expect(await items.toggleDay('nope', '2026-10-14')).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await items.toggleDay('item-1', '2026-10-32')).toEqual({
      ok: false,
      error: 'Invalid day',
    });
    await db.items.update('item-1', { archivedAt: 1 });
    expect(await items.toggleDay('item-1', '2026-10-14')).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await db.completions.count()).toBe(0);
  });
});

describe('completionDays', () => {
  it('groups completion days by habit', async () => {
    const { items } = await setup();
    await items.create(meditate);
    await items.create({ ...meditate, title: 'Read' });
    await items.toggleDay('item-1', '2026-10-13');
    await items.toggleDay('item-1', '2026-10-14');
    await items.toggleDay('item-2', '2026-10-14');

    const result = await items.completionDays();
    expect(result.ok && Object.keys(result.value).sort()).toEqual(['item-1', 'item-2']);
    expect(result.ok && result.value['item-1']!.sort()).toEqual(['2026-10-13', '2026-10-14']);
    expect(result.ok && result.value['item-2']).toEqual(['2026-10-14']);
  });

  it('is empty when nothing was completed', async () => {
    const { items } = await setup();
    expect(await items.completionDays()).toEqual({ ok: true, value: {} });
  });
});

describe('storage failures', () => {
  it('return a failed Result instead of throwing', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    db.close();

    expect(await items.create(meditate)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.toggleDay('item-1', '2026-10-14')).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.listActive()).toEqual({ ok: false, error: ITEMS_LOAD_ERROR });
    expect(await items.completionDays()).toEqual({ ok: false, error: ITEMS_LOAD_ERROR });
  });
});

describe('default dependencies', () => {
  it('use real UUIDs and the real clock', async () => {
    const db = createDb(`items-repo-defaults-${++dbCounter}`);
    const lists = createListsRepo(db);
    const items = createItemsRepo(db);
    await lists.ensureStarterLists();
    const all = await lists.getAll();
    const listId = all.ok ? all.value[0]!.id : '';

    const created = await items.create({ title: 'Stretch', listId, type: 'daily' });
    expect(created.ok && created.value.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);

    const before = Date.now();
    await items.toggleDay(created.ok ? created.value.id : '', '2026-10-14');
    const stored = (await db.completions.toArray())[0];
    expect(stored?.createdAt).toBeGreaterThanOrEqual(before);
    expect(stored?.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
