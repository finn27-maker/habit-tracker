import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDb, type ItemRecord } from './db';
import { LOAD_ERROR, SAVE_ERROR, createListsRepo } from './lists-repo';
import { FIXTURE_LISTS } from '../testing/fixture-lists';

let dbCounter = 0;

function setup(prefix = 'id') {
  const db = createDb(`lists-repo-${++dbCounter}`);
  let n = 0;
  const repo = createListsRepo(db, {
    newId: () => `${prefix}-${++n}`,
    now: () => 5_000,
    starters: FIXTURE_LISTS,
  });
  return { db, repo };
}

const reading = { name: 'Reading', emoji: '📚', color: 'teal' };
const names = async (repo: ReturnType<typeof setup>['repo']) => {
  const result = await repo.getAll();
  return result.ok ? result.value.map((l) => l.name) : result.error;
};
const item = (id: string, listId: string, extra: Partial<ItemRecord> = {}): ItemRecord => ({
  id,
  listId,
  type: 'todo',
  title: id,
  order: 0,
  ...extra,
});

describe('default dependencies', () => {
  it('use real UUIDs and the real clock', async () => {
    const db = createDb(`lists-repo-defaults-${++dbCounter}`);
    const repo = createListsRepo(db);

    const created = await repo.create(reading);
    expect(created.ok && created.value.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);

    await db.items.add(item('thing', created.ok ? created.value.id : ''));
    const before = Date.now();
    await repo.remove(created.ok ? created.value.id : '');
    const archivedAt = (await db.items.get('thing'))?.archivedAt ?? 0;
    expect(archivedAt).toBeGreaterThanOrEqual(before);
    expect(archivedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('ensureStarterLists', () => {
  it('seeds the four generic starter lists, empty and in order, by default', async () => {
    const db = createDb(`lists-repo-${++dbCounter}`);
    let n = 0;
    const repo = createListsRepo(db, { newId: () => `id-${++n}` });
    expect((await repo.ensureStarterLists()).ok).toBe(true);
    const all = await repo.getAll();
    expect(all).toEqual({
      ok: true,
      value: [
        { id: 'id-1', name: 'Health', emoji: '💪', color: 'orange', order: 0 },
        { id: 'id-2', name: 'Home', emoji: '🏡', color: 'green', order: 1 },
        { id: 'id-3', name: 'Work', emoji: '💼', color: 'blue', order: 2 },
        { id: 'id-4', name: 'Personal', emoji: '⭐', color: 'purple', order: 3 },
      ],
    });
    expect(await db.items.count()).toBe(0);
  });

  it('seeds the lists it is given instead', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    expect(await names(repo)).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
  });

  it('leaves a phone that already has lists alone', async () => {
    const db = createDb(`lists-repo-${++dbCounter}`);
    const old = createListsRepo(db, { starters: FIXTURE_LISTS });
    await old.ensureStarterLists();
    const updated = createListsRepo(db);
    await updated.ensureStarterLists();
    const all = await updated.getAll();
    expect(all.ok && all.value.map((l) => l.name)).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
  });

  it('seeds only once, even when two app instances race', async () => {
    const name = `lists-repo-race-${++dbCounter}`;
    const dbA = createDb(name);
    const dbB = createDb(name);
    const a = createListsRepo(dbA, { newId: () => `a-${Math.random()}` });
    const b = createListsRepo(dbB, { newId: () => `b-${Math.random()}` });
    const [ra, rb] = await Promise.all([a.ensureStarterLists(), b.ensureStarterLists()]);
    expect(ra.ok && rb.ok).toBe(true);
    expect(await dbA.lists.count()).toBe(4);
  });

  it('never brings deleted starter lists back', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    for (const id of ['id-1', 'id-2', 'id-3', 'id-4']) await repo.remove(id);
    await repo.ensureStarterLists();
    expect(await names(repo)).toEqual([]);
  });
});

describe('create', () => {
  it('appends a trimmed list after the existing ones', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    const created = await repo.create({ ...reading, name: '  Reading ' });
    expect(created).toEqual({
      ok: true,
      value: { id: 'id-5', name: 'Reading', emoji: '📚', color: 'teal', order: 4 },
    });
  });

  it('starts at order 0 when there are no lists', async () => {
    const { repo } = setup();
    const created = await repo.create(reading);
    expect(created.ok && created.value.order).toBe(0);
  });

  it('rejects invalid input without writing anything', async () => {
    const { repo } = setup();
    expect(await repo.create({ ...reading, name: ' ' })).toEqual({
      ok: false,
      error: "List name can't be empty",
    });
    expect(await names(repo)).toEqual([]);
  });
});

describe('update', () => {
  it('renames and recolors a list, keeping its place', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    const updated = await repo.update('id-2', { name: 'Day Job', emoji: '🧑‍💻', color: 'red' });
    expect(updated).toEqual({
      ok: true,
      value: { id: 'id-2', name: 'Day Job', emoji: '🧑‍💻', color: 'red', order: 1 },
    });
    expect(await names(repo)).toEqual(['Fitness', 'Day Job', 'Side Business', 'Personal']);
  });

  it('reports a missing list', async () => {
    const { repo } = setup();
    expect(await repo.update('nope', reading)).toEqual({ ok: false, error: 'List not found' });
  });

  it('rejects invalid input', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    expect((await repo.update('id-1', { ...reading, emoji: 'ab' })).ok).toBe(false);
  });
});

describe('moveTo', () => {
  it('moves a list to a place and renumbers the order from 0', async () => {
    const { repo, db } = setup();
    await repo.ensureStarterLists();
    const moved = await repo.moveTo('id-4', 0);
    expect(moved.ok && moved.value.map((l) => l.name)).toEqual([
      'Personal',
      'Fitness',
      'Work',
      'Side Business',
    ]);
    expect((await db.lists.orderBy('order').toArray()).map((l) => l.order)).toEqual([0, 1, 2, 3]);
    expect(await names(repo)).toEqual(['Personal', 'Fitness', 'Work', 'Side Business']);
  });

  it('clamps a place past either end', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    await repo.moveTo('id-1', 99);
    expect(await names(repo)).toEqual(['Work', 'Side Business', 'Personal', 'Fitness']);
    await repo.moveTo('id-3', -1);
    expect(await names(repo)).toEqual(['Side Business', 'Work', 'Personal', 'Fitness']);
  });

  it('reports a missing list and changes nothing', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    expect(await repo.moveTo('nope', 0)).toEqual({ ok: false, error: 'List not found' });
    expect(await names(repo)).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
  });

  it('keeps 100 lists numbered 0 to 99 after a move', async () => {
    const { repo, db } = setup();
    for (let i = 0; i < 100; i++) await repo.create({ ...reading, name: `List ${i}` });
    const all = await repo.getAll();
    const id = all.ok ? all.value[50]!.id : '';
    await repo.moveTo(id, 1);
    const stored = await db.lists.orderBy('order').toArray();
    expect(stored.map((l) => l.order)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(stored[1]!.name).toBe('List 50');
  });
});

describe('remove', () => {
  it('deletes the list, renumbers the rest and archives its open items', async () => {
    const { repo, db } = setup();
    await repo.ensureStarterLists();
    await db.items.bulkAdd([
      item('open-1', 'id-2'),
      item('open-2', 'id-2'),
      item('already', 'id-2', { archivedAt: 1 }),
      item('other', 'id-1'),
    ]);

    expect((await repo.remove('id-2')).ok).toBe(true);

    expect(await names(repo)).toEqual(['Fitness', 'Side Business', 'Personal']);
    expect((await db.lists.orderBy('order').toArray()).map((l) => l.order)).toEqual([0, 1, 2]);
    const items = Object.fromEntries((await db.items.toArray()).map((i) => [i.id, i.archivedAt]));
    expect(items).toEqual({ 'open-1': 5_000, 'open-2': 5_000, already: 1, other: undefined });
  });

  it('reports a missing list', async () => {
    const { repo } = setup();
    expect(await repo.remove('nope')).toEqual({ ok: false, error: 'List not found' });
  });
});

describe('openItemCount', () => {
  it('counts only items that are not archived', async () => {
    const { repo, db } = setup();
    await repo.ensureStarterLists();
    await db.items.bulkAdd([
      item('a', 'id-2'),
      item('b', 'id-2'),
      item('c', 'id-2', { archivedAt: 9 }),
    ]);
    expect(await repo.openItemCount('id-2')).toEqual({ ok: true, value: 2 });
  });
});

describe('storage failures', () => {
  it('return a failed Result instead of throwing', async () => {
    const { repo, db } = setup();
    await repo.ensureStarterLists();
    db.close();

    expect(await repo.getAll()).toEqual({ ok: false, error: LOAD_ERROR });
    expect(await repo.ensureStarterLists()).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await repo.create(reading)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await repo.update('id-1', reading)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await repo.moveTo('id-1', 2)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await repo.remove('id-1')).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await repo.openItemCount('id-1')).toEqual({ ok: false, error: LOAD_ERROR });
  });
});
