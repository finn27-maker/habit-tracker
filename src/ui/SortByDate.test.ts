import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { SAVE_ERROR } from '../data/errors';
import { setupApp, type AppCtx } from '../testing/app-fixture';
import ListPage from './ListPage.svelte';

// Wednesday 2026-10-14. Fixture lists: list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal.
const setup = () => setupApp(undefined, 'sort-by-date');

/** Work's to-dos, dragged into "Update pitch deck", "Call the bank", "Send term sheet". */
async function seed(ctx: AppCtx) {
  await ctx.listsRepo.ensureStarterLists();
  const add = async (title: string, extra: { dueDate?: string; type?: string; listId?: string } = {}) => {
    const made = await ctx.itemsRepo.create({ title, listId: extra.listId ?? 'list-2', type: extra.type ?? 'todo', ...extra });
    if (!made.ok) throw new Error(made.error);
    return made.value.id;
  };
  const deck = await add('Update pitch deck');
  const send = await add('Send term sheet', { dueDate: '2026-10-14' });
  const call = await add('Call the bank', { dueDate: '2026-10-20' });
  await ctx.itemsRepo.moveTodo(deck, 0);
  await ctx.itemsRepo.moveTodo(call, 1);
  return { add, deck, send, call };
}

const renderList = (ctx: AppCtx, listId = 'list-2') =>
  render(ListPage, { props: { listId, listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock } });

const todoGroup = () => screen.getByRole('list', { name: 'To-dos' });
const groupNames = () => [...todoGroup().querySelectorAll('.reorder-name')].map((name) => name.textContent);
const sortButton = () => screen.queryByRole('button', { name: 'Sort by date' });
const DATE_ORDER = ['Send term sheet', 'Call the bank', 'Update pitch deck'];
const OWN_ORDER = ['Update pitch deck', 'Call the bank', 'Send term sheet'];

async function openEdit() {
  await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
}

describe('Sort by date', () => {
  it('shows for a list in its own order and puts the to-dos back in date order', async () => {
    const ctx = setup();
    await seed(ctx);
    renderList(ctx);
    await openEdit();
    expect(groupNames()).toEqual(OWN_ORDER);

    await fireEvent.click(sortButton()!);
    expect(groupNames()).toEqual(DATE_ORDER);
    expect(await screen.findByText('To-dos sorted by date.')).toHaveAttribute('role', 'status');
    expect(sortButton()).toBeNull();
    expect((await ctx.db.lists.get('list-2'))?.manualTodoOrder).toBeUndefined();

    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const names = screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'));
    expect(names).toEqual(DATE_ORDER);
  });

  it('is hidden for a list still in date order, outside Edit, and with one open to-do', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'A', listId: 'list-2', type: 'todo' });
    await ctx.itemsRepo.create({ title: 'B', listId: 'list-2', type: 'todo' });
    const one = await ctx.itemsRepo.create({ title: 'Only', listId: 'list-3', type: 'todo' });
    await ctx.itemsRepo.create({ title: 'Read', listId: 'list-3', type: 'daily' });
    await ctx.itemsRepo.create({ title: 'Walk', listId: 'list-3', type: 'daily' });
    if (!one.ok) throw new Error(one.error);
    await ctx.itemsRepo.moveTodo(one.value.id, 0);

    const { unmount } = renderList(ctx);
    await screen.findByRole('checkbox', { name: 'A' });
    expect(sortButton()).toBeNull();
    await openEdit();
    expect(sortButton()).toBeNull();
    unmount();

    renderList(ctx, 'list-3');
    await openEdit();
    expect((await ctx.db.lists.get('list-3'))?.manualTodoOrder).toBe(true);
    expect(sortButton()).toBeNull();
  });

  it('starts the next drag from date order and shows the button again', async () => {
    const ctx = setup();
    await seed(ctx);
    renderList(ctx);
    await openEdit();
    await fireEvent.click(sortButton()!);
    await screen.findByText('To-dos sorted by date.');

    await fireEvent.click(within(todoGroup()).getByRole('button', { name: 'Move Update pitch deck up' }));
    await fireEvent.click(within(todoGroup()).getByRole('button', { name: 'Move Update pitch deck up' }));
    expect(groupNames()).toEqual(['Update pitch deck', 'Send term sheet', 'Call the bank']);
    expect(sortButton()).toBeInTheDocument();
    expect(screen.queryByText('To-dos sorted by date.')).toBeNull();
    await waitFor(async () => expect((await ctx.db.lists.get('list-2'))?.manualTodoOrder).toBe(true));
  });

  it('keeps habits, completed to-dos, other lists and the to-dos themselves unchanged', async () => {
    const ctx = setup();
    const { add, deck } = await seed(ctx);
    const review = await add('Review pipeline', { type: 'daily' });
    await add('Call one lead', { type: 'daily' });
    await ctx.itemsRepo.moveTo(review, 1);
    const done = await add('Filed taxes');
    await ctx.itemsRepo.setTodoDone(done, true);
    const other = await add('Other', { listId: 'list-4' });
    await add('Second', { listId: 'list-4' });
    await ctx.itemsRepo.moveTodo(other, 1);
    const before = await ctx.db.items.toArray();

    renderList(ctx);
    await openEdit();
    const habits = () => [...screen.getByRole('list', { name: 'Habits and goals' }).querySelectorAll('.reorder-name')].map((n) => n.textContent);
    const habitOrder = habits();
    await fireEvent.click(sortButton()!);
    await screen.findByText('To-dos sorted by date.');

    expect(habits()).toEqual(habitOrder);
    expect(await ctx.db.items.toArray()).toEqual(before);
    expect((await ctx.db.lists.get('list-4'))?.manualTodoOrder).toBe(true);
    expect((await ctx.db.items.get(deck))?.title).toBe('Update pitch deck');
  });

  it('puts my own order back and says so when the save fails', async () => {
    const ctx = setup();
    await seed(ctx);
    renderList(ctx);
    await openEdit();
    ctx.db.close();

    await fireEvent.click(sortButton()!);
    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(groupNames()).toEqual(OWN_ORDER);
    expect(sortButton()).toBeInTheDocument();
    expect(screen.queryByText('To-dos sorted by date.')).toBeNull();
  });

  it('sorts 200 to-dos at once', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.db.items.bulkAdd(
      Array.from({ length: 200 }, (_, i) => ({
        id: `t${i}`,
        listId: 'list-2',
        type: 'todo' as const,
        title: `To-do ${i}`,
        order: i,
        dueDate: `2026-11-${String(28 - (i % 28)).padStart(2, '0')}`,
      })),
    );
    await ctx.db.lists.update('list-2', { manualTodoOrder: true });
    renderList(ctx);
    await openEdit();

    const started = performance.now();
    await fireEvent.click(sortButton()!);
    expect(groupNames()[0]).toBe('To-do 27');
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('lists repository sortTodosByDate', () => {
  it('clears the own-order flag and leaves order numbers alone', async () => {
    const ctx = setup();
    const { deck } = await seed(ctx);
    const order = (await ctx.db.items.get(deck))?.order;

    expect(await ctx.listsRepo.sortTodosByDate('list-2')).toEqual({ ok: true, value: undefined });
    expect((await ctx.db.lists.get('list-2'))?.manualTodoOrder).toBeUndefined();
    expect((await ctx.db.items.get(deck))?.order).toBe(order);
    expect(await ctx.listsRepo.sortTodosByDate('list-2')).toEqual({ ok: true, value: undefined });
  });

  it('refuses a list that is gone and changes nothing', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    const before = await ctx.db.lists.toArray();

    expect(await ctx.listsRepo.sortTodosByDate('gone')).toEqual({ ok: false, error: 'List not found' });
    expect(await ctx.db.lists.toArray()).toEqual(before);
  });
});
