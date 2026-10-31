import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, BACKUP_DAMAGED } from '../domain/backup';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import { createBackupRepo } from './backup-repo';
import { createDb } from './db';
import { createItemsRepo } from './items-repo';
import { createListsRepo } from './lists-repo';

let dbCounter = 0;

/** Fixture lists are list-1 Fitness … list-4 Personal; the clock is set per test. */
async function setup(start = new Date(2026, 9, 27, 9, 0)) {
  const db = createDb(`fair-rates-${++dbCounter}`);
  let n = 0;
  let current = start.getTime();
  const lists = createListsRepo(db, { newId: () => `list-${++n}`, starters: FIXTURE_LISTS });
  const items = createItemsRepo(db, { newId: () => `item-${++n}`, now: () => current });
  await lists.ensureStarterLists();
  return {
    db,
    items,
    backup: createBackupRepo(db),
    setNow: (date: Date) => {
      current = date.getTime();
    },
  };
}

const stored = async (ctx: Awaited<ReturnType<typeof setup>>, id: string) => ctx.db.items.get(id);

describe('the day a habit was added', () => {
  it('is recorded for habits and goals, not to-dos', async () => {
    const ctx = await setup();
    const habit = await ctx.items.create({ title: 'Read', listId: 'list-1', type: 'daily' });
    const goal = await ctx.items.create({ title: 'Run', listId: 'list-1', type: 'weekly', target: 3 });
    const todo = await ctx.items.create({ title: 'Call', listId: 'list-1', type: 'todo' });
    expect(habit.ok && habit.value.startedOn).toBe('2026-10-27');
    expect(goal.ok && goal.value.startedOn).toBe('2026-10-27');
    expect(todo.ok && 'startedOn' in todo.value).toBe(false);
  });

  it('is set when a to-do becomes a habit, and kept between daily and weekly', async () => {
    const ctx = await setup(new Date(2026, 9, 1, 9));
    const todo = await ctx.items.create({ title: 'Stretch', listId: 'list-1', type: 'todo' });
    const id = todo.ok ? todo.value.id : '';
    ctx.setNow(new Date(2026, 9, 28, 9));
    await ctx.items.update(id, { title: 'Stretch', listId: 'list-1', type: 'daily' });
    expect((await stored(ctx, id))?.startedOn).toBe('2026-10-28');

    ctx.setNow(new Date(2026, 9, 29, 9));
    await ctx.items.update(id, { title: 'Stretch', listId: 'list-1', type: 'weekly', target: 3 });
    await ctx.items.update(id, { title: 'Stretch', listId: 'list-1', type: 'daily' });
    expect((await stored(ctx, id))?.startedOn).toBe('2026-10-28');
  });

  it('is left off habits made before it was recorded', async () => {
    const ctx = await setup();
    await ctx.db.items.add({ id: 'old', listId: 'list-1', type: 'daily', title: 'Meditate', order: 0 });
    await ctx.items.update('old', { title: 'Meditate daily', listId: 'list-1' });
    const all = await ctx.items.listActive();
    expect(all.ok && 'startedOn' in all.value[0]!).toBe(false);
  });

  it('survives a backup and restore', async () => {
    const ctx = await setup();
    await ctx.items.create({ title: 'Read', listId: 'list-1', type: 'daily' });
    const data = await ctx.backup.read();
    const parsed = parseBackup(JSON.stringify(createBackup(data.ok ? data.value : (undefined as never), new Date())));
    expect(parsed.ok && parsed.value.data.items[0]!.startedOn).toBe('2026-10-27');
  });

  it('makes a backup with a start day that is not a day damaged', async () => {
    const ctx = await setup();
    await ctx.items.create({ title: 'Read', listId: 'list-1', type: 'daily' });
    const data = await ctx.backup.read();
    const file = createBackup(data.ok ? data.value : (undefined as never), new Date());
    file.data.items[0]!.startedOn = 'yesterday';
    expect(parseBackup(JSON.stringify(file))).toEqual({ ok: false, error: BACKUP_DAMAGED });
  });
});
