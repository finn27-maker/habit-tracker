import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createAssistantRepo } from '../data/assistant-repo';
import { createBackupRepo } from '../data/backup-repo';
import { SAVE_ERROR } from '../data/errors';
import { createBackup, parseBackup } from '../domain/backup';
import { setupApp, type AppCtx } from '../testing/app-fixture';
import ListPage from './ListPage.svelte';

// Wednesday 2026-10-14. Fixture lists: list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal.
const setup = () => setupApp(undefined, 'todo-order');

async function seed(ctx: AppCtx) {
  await ctx.listsRepo.ensureStarterLists();
  const add = async (title: string, extra: { dueDate?: string; type?: string; listId?: string } = {}) => {
    const made = await ctx.itemsRepo.create({ title, listId: extra.listId ?? 'list-2', type: extra.type ?? 'todo', ...extra });
    if (!made.ok) throw new Error(made.error);
    return made.value.id;
  };
  return {
    add,
    deck: await add('Update pitch deck'),
    send: await add('Send term sheet', { dueDate: '2026-10-14' }),
    call: await add('Call the bank', { dueDate: '2026-10-20' }),
  };
}

const renderList = (ctx: AppCtx, listId = 'list-2') =>
  render(ListPage, { props: { listId, listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock } });

/** The open to-dos as the list page shows them. */
const pageTodos = () =>
  screen
    .getAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label'))
    .filter((name) => name !== null);

const todoGroup = () => screen.getByRole('list', { name: 'To-dos' });
const groupNames = () => [...todoGroup().querySelectorAll('.reorder-name')].map((name) => name.textContent);

async function openEdit() {
  await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
}

describe('to-do order on a list page', () => {
  it('shows Edit with two to-dos and a To-dos group in the order on screen', async () => {
    const ctx = setup();
    await seed(ctx);
    renderList(ctx);
    await openEdit();

    expect(groupNames()).toEqual(['Send term sheet', 'Call the bank', 'Update pitch deck']);
    expect(within(todoGroup()).getByRole('button', { name: 'Reorder Update pitch deck' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Habits and goals' })).toBeNull();
    expect(
      screen.getByText('Drag ☰ to put habits, goals and to-dos in order. Today and Upcoming still sort to-dos by date.'),
    ).toBeInTheDocument();
  });

  it('hides Edit with one to-do and one habit', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Read', listId: 'list-3', type: 'daily' });
    await ctx.itemsRepo.create({ title: 'Email', listId: 'list-3', type: 'todo' });
    renderList(ctx, 'list-3');

    await screen.findByRole('checkbox', { name: 'Email' });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('moves a to-do, keeps the order after Done, and saves it', async () => {
    const ctx = setup();
    const { deck } = await seed(ctx);
    renderList(ctx);
    await openEdit();

    await fireEvent.click(within(todoGroup()).getByRole('button', { name: 'Move Update pitch deck up' }));
    await fireEvent.click(within(todoGroup()).getByRole('button', { name: 'Move Update pitch deck up' }));
    expect(groupNames()).toEqual(['Update pitch deck', 'Send term sheet', 'Call the bank']);
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(pageTodos()).toEqual(['Update pitch deck', 'Send term sheet', 'Call the bank']);
    await waitFor(async () => expect((await ctx.db.lists.get('list-2'))!.manualTodoOrder).toBe(true));
    const stored = await ctx.db.items.where('listId').equals('list-2').toArray();
    const order = (id: string) => stored.find((item) => item.id === id)!.order;
    expect(order(deck)).toBeLessThan(Math.min(...stored.filter((item) => item.id !== deck).map((item) => item.order)));
  });

  it('keeps the order after a reload', async () => {
    const ctx = setup();
    const { deck } = await seed(ctx);
    await ctx.itemsRepo.moveTodo(deck, 0);
    renderList(ctx);

    await screen.findByRole('checkbox', { name: 'Update pitch deck' });
    expect(pageTodos()).toEqual(['Update pitch deck', 'Send term sheet', 'Call the bank']);
  });

  it('leaves other lists in date order', async () => {
    const ctx = setup();
    const { add, deck } = await seed(ctx);
    await add('Personal undated', { listId: 'list-4' });
    await add('Personal today', { listId: 'list-4', dueDate: '2026-10-14' });
    await ctx.itemsRepo.moveTodo(deck, 0);
    renderList(ctx, 'list-4');

    await screen.findByRole('checkbox', { name: 'Personal today' });
    expect(pageTodos()).toEqual(['Personal today', 'Personal undated']);
  });

  it('puts new and assistant-delivered to-dos at the bottom of a reordered list', async () => {
    const ctx = setup();
    const { add, deck } = await seed(ctx);
    await ctx.itemsRepo.moveTodo(deck, 0);
    await add('Email the lender', { dueDate: '2026-10-14' });
    await createAssistantRepo(ctx.db).save([{ id: 'a1', title: 'Review terms', list: 'Work', due: undefined }]);
    renderList(ctx);

    await screen.findByRole('checkbox', { name: 'Review terms' });
    expect(pageTodos()).toEqual([
      'Update pitch deck',
      'Send term sheet',
      'Call the bank',
      'Email the lender',
      'Review terms',
    ]);
  });

  it('puts the order back and says so when a move cannot be saved', async () => {
    const ctx = setup();
    await seed(ctx);
    renderList(ctx);
    await openEdit();
    ctx.db.close();

    await fireEvent.click(within(todoGroup()).getByRole('button', { name: 'Move Call the bank up' }));

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    expect(groupNames()).toEqual(['Send term sheet', 'Call the bank', 'Update pitch deck']);
  });

  it('shows to-do titles as plain text in Edit mode', async () => {
    const ctx = setup();
    const { add } = await seed(ctx);
    await add('<img src=x onerror=alert(1)>');
    const { container } = renderList(ctx);
    await openEdit();

    expect(within(todoGroup()).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('the to-do order in storage', () => {
  it('refuses a finished, deleted, habit or unknown item without throwing', async () => {
    const ctx = setup();
    const { add, send, call } = await seed(ctx);
    const habit = await add('Read', { type: 'daily' });
    await ctx.itemsRepo.setTodoDone(send, true);
    await ctx.itemsRepo.archive(call);

    for (const id of [send, call, habit, 'nope']) {
      expect(await ctx.itemsRepo.moveTodo(id, 0)).toEqual({ ok: false, error: 'To-do not found' });
    }
    expect((await ctx.db.lists.get('list-2'))!.manualTodoOrder).toBeUndefined();
  });

  it('keeps the order and the list setting through a backup and restore', async () => {
    const ctx = setup();
    const { deck } = await seed(ctx);
    await ctx.itemsRepo.moveTodo(deck, 0);
    const backups = createBackupRepo(ctx.db);
    const read = await backups.read();
    if (!read.ok) throw new Error(read.error);
    const parsed = parseBackup(JSON.stringify(createBackup(read.value, new Date())));
    if (!parsed.ok) throw new Error(parsed.error);
    await backups.restore(parsed.value.data);
    renderList(ctx);

    await screen.findByRole('checkbox', { name: 'Update pitch deck' });
    expect(pageTodos()).toEqual(['Update pitch deck', 'Send term sheet', 'Call the bank']);
    expect((await ctx.db.lists.get('list-2'))!.manualTodoOrder).toBe(true);
  });

  it('moves a to-do moved to another reordered list to its bottom', async () => {
    const ctx = setup();
    const { add, call } = await seed(ctx);
    const first = await add('Personal one', { listId: 'list-4' });
    await add('Personal two', { listId: 'list-4' });
    await ctx.itemsRepo.moveTodo(first, 1);
    await ctx.itemsRepo.update(call, { title: 'Call the bank', listId: 'list-4', dueDate: '2026-10-20' });
    renderList(ctx, 'list-4');

    await screen.findByRole('checkbox', { name: 'Call the bank' });
    expect(pageTodos()).toEqual(['Personal two', 'Personal one', 'Call the bank']);
  });
});
