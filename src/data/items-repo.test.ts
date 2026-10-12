import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { dayKey } from '../domain/dates';
import { createDb } from './db';
import { ITEMS_LOAD_ERROR, createItemsRepo } from './items-repo';
import { SAVE_ERROR, createListsRepo } from './lists-repo';
import { FIXTURE_LISTS } from '../testing/fixture-lists';

let dbCounter = 0;

/** Wednesday 2026-10-14, in the week that started on Sunday 2026-10-11. */
const NOW = new Date(2026, 9, 14, 9, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

async function setup(now: () => number = () => NOW) {
  const db = createDb(`items-repo-${++dbCounter}`);
  let l = 0;
  let i = 0;
  const lists = createListsRepo(db, { newId: () => `list-${++l}`, starters: FIXTURE_LISTS });
  const items = createItemsRepo(db, { newId: () => `item-${++i}`, now });
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
      { id: 'item-2', itemId: 'item-1', dayKey: '2026-10-14', createdAt: NOW },
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

const peloton = { title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 };

describe('weekly goals: create', () => {
  it('records the target from the Sunday that starts the current week', async () => {
    const { items, db } = await setup();
    expect(await items.create(peloton)).toEqual({
      ok: true,
      value: { id: 'item-1', listId: 'list-1', type: 'weekly', title: 'Peloton ride', order: 0 },
    });
    expect(await db.targetHistory.toArray()).toEqual([
      { itemId: 'item-1', effectiveWeekStart: '2026-10-11', target: 3 },
    ]);
  });

  it('rejects a bad target without writing anything', async () => {
    const { items, db } = await setup();
    expect(await items.create({ ...peloton, target: 15 })).toEqual({
      ok: false,
      error: 'Pick 1 to 14 times a week',
    });
    expect(await db.items.count()).toBe(0);
    expect(await db.targetHistory.count()).toBe(0);
  });

  it('records no target for a daily habit', async () => {
    const { items, db } = await setup();
    await items.create({ ...meditate, target: 5 });
    expect(await db.targetHistory.count()).toBe(0);
  });
});

describe('addCompletion', () => {
  it('adds one completion per call, several on the same day', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    expect(await items.addCompletion('item-1', '2026-10-14')).toEqual({ ok: true, value: undefined });
    expect(await items.addCompletion('item-1', '2026-10-14')).toEqual({ ok: true, value: undefined });
    expect((await db.completions.toArray()).map((c) => [c.itemId, c.dayKey])).toEqual([
      ['item-1', '2026-10-14'],
      ['item-1', '2026-10-14'],
    ]);
  });

  it('refuses unknown, archived and non-weekly items and invalid days', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await items.create(meditate);
    await items.create({ ...peloton, title: 'Old goal' });
    await db.items.update('item-3', { archivedAt: 1 });

    expect(await items.addCompletion('nope', '2026-10-14')).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await items.addCompletion('item-3', '2026-10-14')).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await items.addCompletion('item-2', '2026-10-14')).toEqual({
      ok: false,
      error: 'Not a weekly goal',
    });
    expect(await items.addCompletion('item-1', '2026-13-01')).toEqual({
      ok: false,
      error: 'Invalid day',
    });
    expect(await db.completions.count()).toBe(0);
  });
});

describe('removeLatestCompletion', () => {
  const weekStart = '2026-10-11';

  it('removes the entry on the latest day of the week and nothing else', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await db.completions.bulkAdd([
      { id: 'c-prev', itemId: 'item-1', dayKey: '2026-10-10', createdAt: 1 },
      { id: 'c-mon', itemId: 'item-1', dayKey: '2026-10-12', createdAt: 2 },
      { id: 'c-wed', itemId: 'item-1', dayKey: '2026-10-14', createdAt: 3 },
    ]);

    expect(await items.removeLatestCompletion('item-1', weekStart)).toEqual({
      ok: true,
      value: true,
    });
    expect((await db.completions.toArray()).map((c) => c.id).sort()).toEqual(['c-mon', 'c-prev']);
  });

  it('removes the one logged last when several share the day', async () => {
    let clock = NOW;
    const { items, db } = await setup(() => clock);
    await items.create(peloton);
    await items.addCompletion('item-1', '2026-10-14'); // item-2, earlier
    clock += 5_000;
    await items.addCompletion('item-1', '2026-10-14'); // item-3, later

    await items.removeLatestCompletion('item-1', weekStart);
    expect((await db.completions.toArray()).map((c) => c.id)).toEqual(['item-2']);
  });

  it('breaks a tie in the logged time by taking the later id', async () => {
    const { items, db } = await setup(); // the clock never moves, so createdAt ties
    await items.create(peloton);
    await items.addCompletion('item-1', '2026-10-14');
    await items.addCompletion('item-1', '2026-10-14');

    await items.removeLatestCompletion('item-1', weekStart);
    expect((await db.completions.toArray()).map((c) => c.id)).toEqual(['item-2']);
  });

  it('reports that nothing was removed when the week is empty', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await db.completions.add({ id: 'c-prev', itemId: 'item-1', dayKey: '2026-10-10', createdAt: 1 });
    expect(await items.removeLatestCompletion('item-1', weekStart)).toEqual({
      ok: true,
      value: false,
    });
    expect(await db.completions.count()).toBe(1);
  });

  it('refuses unknown or archived items and an invalid week start', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    expect(await items.removeLatestCompletion('nope', weekStart)).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await items.removeLatestCompletion('item-1', 'last sunday')).toEqual({
      ok: false,
      error: 'Invalid day',
    });
    await db.items.update('item-1', { archivedAt: 1 });
    expect(await items.removeLatestCompletion('item-1', weekStart)).toEqual({
      ok: false,
      error: 'Habit not found',
    });
  });
});

describe('changing type', () => {
  const asWeekly = (target: number) => ({ title: 'Gym', listId: 'list-1', type: 'weekly', target });
  const asDaily = { title: 'Gym', listId: 'list-1', type: 'daily' };
  const asTodo = (dueDate = '') => ({ title: 'Gym', listId: 'list-1', type: 'todo', dueDate });

  async function gym(days: string[]) {
    const ctx = await setup();
    await ctx.items.create({ ...asDaily });
    for (const day of days) await ctx.items.toggleDay('item-1', day);
    return ctx;
  }

  it('turns a daily habit into a weekly goal whose target covers its past check-ins', async () => {
    const { items, db } = await gym(['2026-10-01', '2026-10-02', '2026-10-13']);
    const changed = await items.update('item-1', asWeekly(3));
    expect(changed.ok && changed.value.type).toBe('weekly');
    expect(await db.targetHistory.toArray()).toEqual([
      { itemId: 'item-1', effectiveWeekStart: '2026-09-27', target: 3 },
    ]);
    expect(await db.completions.count()).toBe(3);
  });

  it('starts the target this week when there are no check-ins', async () => {
    const { items, db } = await gym([]);
    await items.update('item-1', asWeekly(5));
    expect(await db.targetHistory.toArray()).toEqual([
      { itemId: 'item-1', effectiveWeekStart: '2026-10-11', target: 5 },
    ]);
  });

  it('keeps old weeks’ targets when a former weekly goal becomes weekly again', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await db.targetHistory.put({ itemId: 'item-1', effectiveWeekStart: '2026-09-27', target: 4 });
    await db.targetHistory.filter((point) => point.effectiveWeekStart === '2026-10-11').delete();
    await items.update('item-1', { ...peloton, type: 'daily' });
    await items.update('item-1', { ...peloton, type: 'weekly', target: 2 });
    const points = await db.targetHistory.orderBy('[itemId+effectiveWeekStart]').toArray();
    expect(points.map((point) => [point.effectiveWeekStart, point.target])).toEqual([
      ['2026-09-27', 4],
      ['2026-10-11', 2],
    ]);
  });

  it('turns a weekly goal into a daily habit, keeping every log', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await items.addCompletion('item-1', '2026-10-12');
    await items.addCompletion('item-1', '2026-10-12');
    const changed = await items.update('item-1', { ...peloton, type: 'daily' });
    expect(changed.ok && changed.value.type).toBe('daily');
    expect(await db.completions.count()).toBe(2);
    // Unchecking the day as a daily habit clears it fully.
    expect(await items.toggleDay('item-1', '2026-10-12')).toEqual({ ok: true, value: false });
    expect(await db.completions.count()).toBe(0);
  });

  it('keeps check-ins through a to-do and back, and moves to the end of its new group', async () => {
    const { items, db } = await gym(['2026-10-12', '2026-10-13']);
    await items.create({ title: 'Walk', listId: 'list-1', type: 'daily' });
    await items.create({ title: 'Buy shoes', listId: 'list-1', type: 'todo' });

    const todo = await items.update('item-1', asTodo('2026-10-15'));
    expect(todo.ok && todo.value).toMatchObject({ type: 'todo', dueDate: '2026-10-15', order: 3 });
    expect(await db.completions.count()).toBe(2);

    const back = await items.update('item-1', asDaily);
    expect(back.ok && back.value).toMatchObject({ type: 'daily', dueDate: '2026-10-15', order: 4 });
    const all = await items.listActive();
    expect(all.ok && all.value.filter((item) => item.type !== 'todo').map((item) => item.title)).toEqual([
      'Walk',
      'Gym',
    ]);
  });

  it('keeps a to-do’s checkmark while it is a habit', async () => {
    const { items } = await setup();
    await items.create({ title: 'Call mom', listId: 'list-1', type: 'todo' });
    await items.setTodoDone('item-1', true);
    await items.update('item-1', { title: 'Call mom', listId: 'list-1', type: 'daily' });
    const back = await items.update('item-1', { title: 'Call mom', listId: 'list-1', type: 'todo' });
    expect(back.ok && back.value.completedAt).toBe(NOW);
  });

  it('refuses bad targets, unknown types and deleted items without changing anything', async () => {
    const { items, db } = await gym(['2026-10-13']);
    expect(await items.update('item-1', asWeekly(0))).toEqual({
      ok: false,
      error: 'Pick 1 to 14 times a week',
    });
    expect(await items.update('item-1', { ...asDaily, type: 'monthly' })).toEqual({
      ok: false,
      error: 'Pick daily, weekly or to-do',
    });
    await items.archive('item-1');
    expect(await items.update('item-1', asWeekly(3))).toEqual({ ok: false, error: 'Habit not found' });
    expect((await db.items.get('item-1'))?.type).toBe('daily');
    expect(await db.targetHistory.count()).toBe(0);
  });
});

describe('update', () => {
  it('renames a habit and moves it to the end of another list', async () => {
    const { items } = await setup();
    await items.create({ ...meditate, title: 'A', listId: 'list-1' });
    await items.create({ ...meditate, title: 'B', listId: 'list-4' });

    expect(await items.update('item-1', { title: '  Stretch ', listId: 'list-4' })).toEqual({
      ok: true,
      value: { id: 'item-1', listId: 'list-4', type: 'daily', title: 'Stretch', order: 1 },
    });
  });

  it('keeps the place in the list when only the name changes', async () => {
    const { items } = await setup();
    await items.create({ ...meditate, title: 'A' });
    await items.create({ ...meditate, title: 'B' });
    const updated = await items.update('item-2', { title: 'B2', listId: 'list-4' });
    expect(updated.ok && updated.value.order).toBe(1);
  });

  it('changes a weekly target from the current week and overwrites it within that week', async () => {
    const { items, db } = await setup();
    await items.create(peloton);

    await items.update('item-1', { title: 'Peloton ride', listId: 'list-1', target: 4 });
    await items.update('item-1', { title: 'Peloton ride', listId: 'list-1', target: 5 });

    expect(await db.targetHistory.toArray()).toEqual([
      { itemId: 'item-1', effectiveWeekStart: '2026-10-11', target: 5 },
    ]);
  });

  it('adds a new record when the target changes in a later week, and keeps the old one', async () => {
    let clock = NOW;
    const { items, db } = await setup(() => clock);
    await items.create(peloton);

    clock += 7 * DAY;
    await items.update('item-1', { title: 'Peloton ride', listId: 'list-1', target: 4 });

    expect((await db.targetHistory.toArray()).map((t) => [t.effectiveWeekStart, t.target]).sort()).toEqual([
      ['2026-10-11', 3],
      ['2026-10-18', 4],
    ]);
  });

  it('writes no target record when the target is unchanged', async () => {
    let clock = NOW;
    const { items, db } = await setup(() => clock);
    await items.create(peloton);

    clock += 7 * DAY;
    await items.update('item-1', { title: 'Spin class', listId: 'list-1', target: 3 });

    expect(await db.targetHistory.count()).toBe(1);
    expect((await db.items.get('item-1'))?.title).toBe('Spin class');
  });

  it('updates a daily habit without any target', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    const updated = await items.update('item-1', { title: 'Meditate 10 min', listId: 'list-4' });
    expect(updated.ok && updated.value.title).toBe('Meditate 10 min');
    expect(await db.targetHistory.count()).toBe(0);
  });

  it('rejects invalid input and missing things without changing anything', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await items.create({ ...peloton, title: 'Archived goal' });
    await db.items.update('item-2', { archivedAt: 1 });
    const before = await db.items.get('item-1');

    expect(await items.update('item-1', { title: ' ', listId: 'list-1', target: 3 })).toEqual({
      ok: false,
      error: "Name can't be empty",
    });
    expect(await items.update('item-1', { title: 'X', listId: 'list-1', target: 0 })).toEqual({
      ok: false,
      error: 'Pick 1 to 14 times a week',
    });
    expect(await items.update('item-1', { title: 'X', listId: 'gone', target: 3 })).toEqual({
      ok: false,
      error: 'List not found',
    });
    expect(await items.update('nope', { title: 'X', listId: 'list-1', target: 3 })).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await items.update('item-2', { title: 'X', listId: 'list-1', target: 3 })).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await db.items.get('item-1')).toEqual(before);
  });
});

describe('archive', () => {
  it('hides the item but keeps its completions and target history', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await items.addCompletion('item-1', '2026-10-12');
    await items.addCompletion('item-1', '2026-10-14');

    expect(await items.archive('item-1')).toEqual({ ok: true, value: undefined });

    expect((await db.items.get('item-1'))?.archivedAt).toBe(NOW);
    expect(await db.completions.count()).toBe(2);
    expect(await db.targetHistory.count()).toBe(1);
    const active = await items.listActive();
    expect(active.ok && active.value).toEqual([]);
  });

  it('leaves other items alone', async () => {
    const { items } = await setup();
    await items.create(meditate);
    await items.create({ ...meditate, title: 'Read' });
    await items.archive('item-1');
    const active = await items.listActive();
    expect(active.ok && active.value.map((item) => item.title)).toEqual(['Read']);
  });

  it('refuses unknown or already archived items without changing them', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    await items.archive('item-1');
    const stamped = (await db.items.get('item-1'))?.archivedAt;

    expect(await items.archive('item-1')).toEqual({ ok: false, error: 'Habit not found' });
    expect(await items.archive('nope')).toEqual({ ok: false, error: 'Habit not found' });
    expect((await db.items.get('item-1'))?.archivedAt).toBe(stamped);
  });

  it('makes every other write refuse the archived item', async () => {
    const { items } = await setup();
    await items.create(peloton);
    await items.create({ ...meditate, title: 'Daily' });
    await items.archive('item-1');
    await items.archive('item-2');
    const gone = { ok: false, error: 'Habit not found' };

    expect(await items.addCompletion('item-1', '2026-10-14')).toEqual(gone);
    expect(await items.removeLatestCompletion('item-1', '2026-10-11')).toEqual(gone);
    expect(await items.toggleDay('item-2', '2026-10-14')).toEqual(gone);
    expect(await items.update('item-2', { title: 'X', listId: 'list-4' })).toEqual(gone);
  });
});

describe('listTargets', () => {
  it('groups target records by goal', async () => {
    let clock = NOW;
    const { items } = await setup(() => clock);
    await items.create(peloton);
    await items.create({ ...peloton, title: 'Read', listId: 'list-4', target: 5 });
    clock += 7 * DAY;
    await items.update('item-1', { title: 'Peloton ride', listId: 'list-1', target: 4 });

    const result = await items.listTargets();
    expect(result.ok && Object.keys(result.value).sort()).toEqual(['item-1', 'item-2']);
    expect(
      result.ok && result.value['item-1']!.map((t) => [t.effectiveWeekStart, t.target]).sort(),
    ).toEqual([
      ['2026-10-11', 3],
      ['2026-10-18', 4],
    ]);
    expect(result.ok && result.value['item-2']).toEqual([
      { effectiveWeekStart: '2026-10-11', target: 5 },
    ]);
  });

  it('is empty when there are no weekly goals', async () => {
    const { items } = await setup();
    expect(await items.listTargets()).toEqual({ ok: true, value: {} });
  });
});

describe('backfill', () => {
  const peloton = { title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 };

  it('marks and un-marks any past day of a daily habit', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    expect(await items.toggleDay('item-1', '2025-01-31')).toEqual({ ok: true, value: true });
    expect((await db.completions.toArray()).map((c) => c.dayKey)).toEqual(['2025-01-31']);
  });

  it('refuses days after today, writing nothing', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    await items.create(peloton);
    const future = { ok: false, error: "Pick a day that isn't in the future" };
    expect(await items.toggleDay('item-1', '2026-10-15')).toEqual(future);
    expect(await items.addCompletion('item-2', '2026-10-15')).toEqual(future);
    expect(await db.completions.count()).toBe(0);
  });

  it('removes the log made last on one day of a weekly goal', async () => {
    let now = NOW;
    const { items, db } = await setup(() => now);
    await items.create(peloton);
    await items.addCompletion('item-1', '2026-10-12');
    now += 1;
    await items.addCompletion('item-1', '2026-10-12');
    await items.addCompletion('item-1', '2026-10-13');

    expect(await items.removeCompletionOn('item-1', '2026-10-12')).toEqual({ ok: true, value: true });
    const left = await db.completions.toArray();
    expect(left.map((c) => [c.dayKey, c.createdAt]).sort()).toEqual([
      ['2026-10-12', NOW],
      ['2026-10-13', NOW + 1],
    ]);
    expect(await items.removeCompletionOn('item-1', '2026-10-11')).toEqual({ ok: true, value: false });
  });

  it('breaks a same-moment tie by removing the log saved last', async () => {
    const { items, db } = await setup();
    await items.create(peloton);
    await items.addCompletion('item-1', '2026-10-12'); // id item-2
    await items.addCompletion('item-1', '2026-10-12'); // id item-3, same timestamp
    await items.removeCompletionOn('item-1', '2026-10-12');
    expect((await db.completions.toArray()).map((c) => c.id)).toEqual(['item-2']);
  });

  it('refuses unknown items, daily habits and invalid days when removing a log', async () => {
    const { items } = await setup();
    await items.create(meditate);
    expect(await items.removeCompletionOn('nope', '2026-10-12')).toEqual({
      ok: false,
      error: 'Habit not found',
    });
    expect(await items.removeCompletionOn('item-1', '2026-10-12')).toEqual({
      ok: false,
      error: 'Not a weekly goal',
    });
    expect(await items.removeCompletionOn('item-1', 'soon')).toEqual({
      ok: false,
      error: 'Invalid day',
    });
  });
});

describe('to-dos', () => {
  const flights = { title: 'Book flights', listId: 'list-4', type: 'todo', dueDate: '2026-10-20' };

  it('stores a due date, and leaves it off when none was picked', async () => {
    const { items, db } = await setup();
    expect(await items.create(flights)).toEqual({
      ok: true,
      value: {
        id: 'item-1',
        listId: 'list-4',
        type: 'todo',
        title: 'Book flights',
        order: 0,
        dueDate: '2026-10-20',
      },
    });
    const undated = await items.create({ ...flights, title: 'Clean garage', dueDate: '' });
    expect(undated.ok && undated.value).not.toHaveProperty('dueDate');
    expect(await db.items.get('item-2')).not.toHaveProperty('dueDate');
    expect(await db.targetHistory.count()).toBe(0);
  });

  it('rejects an invalid due date', async () => {
    const { items } = await setup();
    expect(await items.create({ ...flights, dueDate: '2026-13-01' })).toEqual({
      ok: false,
      error: 'Pick a valid date',
    });
  });

  it('changes or clears the due date when edited', async () => {
    const { items, db } = await setup();
    await items.create(flights);
    const moved = await items.update('item-1', { ...flights, dueDate: '2026-10-22' });
    expect(moved.ok && moved.value.dueDate).toBe('2026-10-22');

    const cleared = await items.update('item-1', { title: 'Book flights', listId: 'list-4' });
    expect(cleared.ok && cleared.value).not.toHaveProperty('dueDate');
    expect(await db.items.get('item-1')).not.toHaveProperty('dueDate');
  });

  it('checks a to-do off with the time, and reopens it', async () => {
    const { items, db } = await setup();
    await items.create(flights);

    const done = await items.setTodoDone('item-1', true);
    expect(done.ok && done.value.completedAt).toBe(NOW);
    expect((await db.items.get('item-1'))?.completedAt).toBe(NOW);

    const reopened = await items.setTodoDone('item-1', false);
    expect(reopened.ok && reopened.value).not.toHaveProperty('completedAt');
    expect(await db.items.get('item-1')).not.toHaveProperty('completedAt');
    expect((await items.listActive()).ok).toBe(true);
  });

  it('keeps the completion time when edited after being checked off', async () => {
    const { items } = await setup();
    await items.create(flights);
    await items.setTodoDone('item-1', true);
    const renamed = await items.update('item-1', { ...flights, title: 'Book train' });
    expect(renamed.ok && renamed.value.completedAt).toBe(NOW);
  });

  it('refuses habits, goals and missing items', async () => {
    const { items } = await setup();
    await items.create(meditate);
    expect(await items.setTodoDone('item-1', true)).toEqual({ ok: false, error: 'Not a to-do' });
    expect(await items.setTodoDone('gone', true)).toEqual({ ok: false, error: 'Habit not found' });
  });
});

describe('recently deleted', () => {
  it('lists archived items with when they were deleted', async () => {
    const { items } = await setup();
    await items.create(meditate);
    await items.create({ ...meditate, title: 'Read' });
    await items.archive('item-1');
    expect(await items.listArchived()).toEqual({
      ok: true,
      value: [{ id: 'item-1', listId: 'list-4', type: 'daily', title: 'Meditate', order: 0, archivedAt: NOW }],
    });
  });

  it('restores an item to the end of its list, keeping its history', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    await items.toggleDay('item-1', '2026-10-13');
    await items.archive('item-1');
    await items.create({ ...meditate, title: 'Read' });

    expect(await items.restore('item-1')).toEqual({
      ok: true,
      value: {
        item: { id: 'item-1', listId: 'list-4', type: 'daily', title: 'Meditate', order: 1 },
        movedTo: null,
      },
    });
    expect(await db.items.get('item-1')).not.toHaveProperty('archivedAt');
    expect(await db.completions.count()).toBe(1);
  });

  it('restores into the first list when its own list was deleted', async () => {
    const { items, lists } = await setup();
    await items.create({ ...meditate, listId: 'list-3' });
    await lists.remove('list-3');

    const restored = await items.restore('item-1');
    expect(restored.ok && restored.value.movedTo).toBe('Fitness');
    expect(restored.ok && restored.value.item.listId).toBe('list-1');
  });

  it('needs a list to restore into', async () => {
    const { items, lists } = await setup();
    await items.create(meditate);
    for (const id of ['list-1', 'list-2', 'list-3', 'list-4']) await lists.remove(id);
    expect(await items.restore('item-1')).toEqual({ ok: false, error: 'Create a list first, then restore.' });
  });

  it('refuses items that are not deleted', async () => {
    const { items } = await setup();
    await items.create(meditate);
    expect(await items.restore('item-1')).toEqual({ ok: false, error: 'Habit not found' });
    expect(await items.restore('nope')).toEqual({ ok: false, error: 'Habit not found' });
  });
});

describe('deleting for good', () => {
  /** Meditate (daily, 2 check-ins), Ride (weekly, 1 log) deleted; Stretch active with 1. */
  async function seeded() {
    const ctx = await setup();
    const { items } = ctx;
    await items.create(meditate);
    await items.create({ title: 'Ride', listId: 'list-1', type: 'weekly', target: 3 });
    await items.create({ ...meditate, title: 'Stretch' });
    await items.toggleDay('item-1', '2026-10-12');
    await items.toggleDay('item-1', '2026-10-13');
    await items.addCompletion('item-2', '2026-10-13');
    await items.toggleDay('item-3', '2026-10-13');
    await items.archive('item-1');
    await items.archive('item-2');
    return ctx;
  }
  const history = async (db: Awaited<ReturnType<typeof setup>>['db'], itemId: string) => ({
    item: await db.items.get(itemId),
    completions: await db.completions.where('itemId').equals(itemId).count(),
    targets: await db.targetHistory.where('itemId').equals(itemId).count(),
  });

  it('removes one deleted item with its check-ins and targets', async () => {
    const { items, db } = await seeded();
    expect(await items.deleteForever('item-2')).toEqual({ ok: true, value: undefined });
    expect(await history(db, 'item-2')).toEqual({ item: undefined, completions: 0, targets: 0 });
    expect((await history(db, 'item-1')).completions).toBe(2);
  });

  it('refuses active and unknown items', async () => {
    const { items, db } = await seeded();
    expect(await items.deleteForever('item-3')).toEqual({ ok: false, error: 'Habit not found' });
    expect(await items.deleteForever('nope')).toEqual({ ok: false, error: 'Habit not found' });
    expect((await history(db, 'item-3')).completions).toBe(1);
  });

  it('empties every deleted item and leaves active ones alone', async () => {
    const { items, db } = await seeded();
    expect(await items.emptyDeleted()).toEqual({ ok: true, value: 2 });
    expect(await history(db, 'item-1')).toEqual({ item: undefined, completions: 0, targets: 0 });
    expect(await history(db, 'item-2')).toEqual({ item: undefined, completions: 0, targets: 0 });
    expect(await history(db, 'item-3')).toMatchObject({ completions: 1 });
    expect(await items.emptyDeleted()).toEqual({ ok: true, value: 0 });
  });
});

describe('clearCompleted', () => {
  it('archives only this list’s completed to-dos and says how many', async () => {
    const { items, db } = await setup();
    const todo = { title: 'A', listId: 'list-4', type: 'todo' };
    await items.create(todo);
    await items.create({ ...todo, title: 'B' });
    await items.create({ ...todo, title: 'Open' });
    await items.create({ ...todo, title: 'Elsewhere', listId: 'list-2' });
    await items.create(meditate);
    for (const id of ['item-1', 'item-2', 'item-4']) await items.setTodoDone(id, true);

    expect(await items.clearCompleted('list-4')).toEqual({ ok: true, value: 2 });
    const archived = (await db.items.toArray()).filter((item) => item.archivedAt !== undefined);
    expect(archived.map((item) => item.title).sort()).toEqual(['A', 'B']);
    expect(await items.clearCompleted('list-4')).toEqual({ ok: true, value: 0 });
  });
});

describe('moveTo', () => {
  it('reorders habits and goals within their list, keeping to-dos after them', async () => {
    const { items } = await setup();
    await items.create({ ...meditate, title: 'Stretch', listId: 'list-1' });
    await items.create({ title: 'Buy shoes', listId: 'list-1', type: 'todo' });
    await items.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
    await items.create({ ...meditate, title: 'Run', listId: 'list-1' });

    expect(await items.moveTo('item-3', 0)).toEqual({ ok: true, value: undefined });
    const all = await items.listActive();
    expect(all.ok && all.value.map((item) => item.title)).toEqual(['Peloton ride', 'Stretch', 'Run', 'Buy shoes']);

    await items.moveTo('item-3', 9);
    const after = await items.listActive();
    expect(after.ok && after.value.map((item) => item.title)).toEqual(['Stretch', 'Run', 'Peloton ride', 'Buy shoes']);
  });

  it('leaves other lists alone and refuses to-dos and missing items', async () => {
    const { items } = await setup();
    await items.create({ ...meditate, listId: 'list-1' });
    await items.create({ ...meditate, title: 'Read' });
    await items.create({ title: 'Buy shoes', listId: 'list-1', type: 'todo' });

    await items.moveTo('item-1', 0);
    expect((await items.listActive()).ok).toBe(true);
    expect(await items.moveTo('item-3', 0)).toEqual({ ok: false, error: 'To-dos follow their due dates' });
    expect(await items.moveTo('nope', 0)).toEqual({ ok: false, error: 'Habit not found' });
  });
});

describe('storage failures', () => {
  it('return a failed Result instead of throwing', async () => {
    const { items, db } = await setup();
    await items.create(meditate);
    db.close();

    expect(await items.create(meditate)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.toggleDay('item-1', '2026-10-14')).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.addCompletion('item-1', '2026-10-14')).toEqual({
      ok: false,
      error: SAVE_ERROR,
    });
    expect(await items.removeLatestCompletion('item-1', '2026-10-11')).toEqual({
      ok: false,
      error: SAVE_ERROR,
    });
    expect(await items.update('item-1', { title: 'X', listId: 'list-1' })).toEqual({
      ok: false,
      error: SAVE_ERROR,
    });
    expect(await items.archive('item-1')).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.setTodoDone('item-1', true)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.removeCompletionOn('item-1', '2026-10-12')).toEqual({
      ok: false,
      error: SAVE_ERROR,
    });
    expect(await items.restore('item-1')).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.deleteForever('item-1')).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.emptyDeleted()).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.clearCompleted('list-1')).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.moveTo('item-1', 0)).toEqual({ ok: false, error: SAVE_ERROR });
    expect(await items.listArchived()).toEqual({ ok: false, error: ITEMS_LOAD_ERROR });
    expect(await items.listActive()).toEqual({ ok: false, error: ITEMS_LOAD_ERROR });
    expect(await items.completionDays()).toEqual({ ok: false, error: ITEMS_LOAD_ERROR });
    expect(await items.listTargets()).toEqual({ ok: false, error: ITEMS_LOAD_ERROR });
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
    await items.toggleDay(created.ok ? created.value.id : '', dayKey(new Date()));
    const stored = (await db.completions.toArray())[0];
    expect(stored?.createdAt).toBeGreaterThanOrEqual(before);
    expect(stored?.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
