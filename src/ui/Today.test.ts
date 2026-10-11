import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createDb } from '../data/db';
import { ITEMS_LOAD_ERROR, createItemsRepo } from '../data/items-repo';
import { LOAD_ERROR, SAVE_ERROR, createListsRepo } from '../data/lists-repo';
import { STARTER_LISTS } from '../domain/lists';
import type { Clock } from '../platform/clock';
import Today from './Today.svelte';

let dbCounter = 0;
const EMPTY = 'Nothing here yet. Tap + to add your first habit or to-do.';

function setup(start = new Date(2026, 9, 14, 9, 0)) {
  const db = createDb(`today-ui-${++dbCounter}`);
  let l = 0;
  let i = 0;
  const listsRepo = createListsRepo(db, { newId: () => `list-${++l}`, now: () => 1_000 });
  const itemsRepo = createItemsRepo(db, { newId: () => `item-${++i}`, now: () => 2_000 });

  let current = start;
  let onNewDay: ((now: Date) => void) | null = null;
  let stopped = false;
  const clock: Clock = {
    now: () => current,
    watch: (callback) => {
      onNewDay = callback;
      return () => {
        stopped = true;
      };
    },
  };

  return {
    db,
    listsRepo,
    itemsRepo,
    clock,
    /** Moves the clock without telling the screen, like a stale screen after midnight. */
    setNow: (date: Date) => {
      current = date;
    },
    /** Moves the clock and delivers the new-day signal. */
    rollTo: (date: Date) => {
      current = date;
      onNewDay?.(date);
    },
    isStopped: () => stopped,
  };
}

type Ctx = ReturnType<typeof setup>;

const renderToday = (ctx: Ctx) =>
  render(Today, {
    props: { listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock },
  });

/** Starter lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function seedHabit(ctx: Ctx, title: string, listId = 'list-1') {
  await ctx.listsRepo.ensureStarterLists();
  await ctx.itemsRepo.create({ title, listId, type: 'daily' });
}

const checkbox = (name: string) => screen.findByRole('checkbox', { name });
const completions = (ctx: Ctx) => ctx.db.completions.toArray();

async function addHabit(name: string, listId?: string) {
  await fireEvent.click(screen.getByRole('button', { name: 'New habit' }));
  await fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } });
  if (listId) await fireEvent.change(screen.getByLabelText('List'), { target: { value: listId } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('Today screen', () => {
  it('shows the date and the empty state when there are no habits', async () => {
    const ctx = setup();
    renderToday(ctx);
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Wednesday, October 14')).toBeInTheDocument();
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New habit' })).toBeInTheDocument();
  });

  it('adds a habit under its list with no streak badge yet', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await fireEvent.click(screen.getByRole('button', { name: 'New habit' }));
    const dialog = screen.getByRole('dialog', { name: 'New habit' });
    expect(within(dialog).getByText('Repeats every day.')).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Meditate' } });
    await fireEvent.change(screen.getByLabelText('List'), { target: { value: 'list-4' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const box = await checkbox('Meditate');
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Personal');
    expect(screen.queryByRole('img', { name: /streak/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('offers the starter lists on a fresh install and defaults to the first', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await fireEvent.click(screen.getByRole('button', { name: 'New habit' }));
    const select = screen.getByLabelText('List');
    expect(select).toHaveValue('list-1');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(
      STARTER_LISTS.map((list) => `${list.emoji} ${list.name}`),
    );
  });

  it('keeps the sheet open and explains what is wrong with the name', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await addHabit('   ');
    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be empty");
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await addHabit('a'.repeat(61));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Name must be 60 characters or fewer'),
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });

  it('says to create a list first when there are none', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    for (const id of ['list-1', 'list-2', 'list-3', 'list-4']) await ctx.listsRepo.remove(id);
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await fireEvent.click(screen.getByRole('button', { name: 'New habit' }));
    expect(
      screen.getByText('Create a list in the Lists tab first, then come back to add a habit.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('checks a habit off with one tap, saves it, and un-checks it on the next tap', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    renderToday(ctx);
    const box = await checkbox('Meditate');

    await fireEvent.click(box);
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('img', { name: '1 day streak' })).toHaveTextContent('🔥 1');
    await waitFor(async () =>
      expect((await completions(ctx)).map((c) => [c.itemId, c.dayKey])).toEqual([
        ['item-1', '2026-10-14'],
      ]),
    );

    await fireEvent.click(box);
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByRole('img', { name: /streak/ })).toBeNull();
    await waitFor(async () => expect(await completions(ctx)).toHaveLength(0));
  });

  it('remembers a check-off after the app is reopened', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    const first = renderToday(ctx);
    await fireEvent.click(await checkbox('Meditate'));
    await waitFor(async () => expect(await completions(ctx)).toHaveLength(1));

    first.unmount();
    renderToday(ctx);
    expect(await checkbox('Meditate')).toHaveAttribute('aria-checked', 'true');
  });

  it("shows yesterday's streak as at risk, then extends it when checked", async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    await ctx.db.completions.bulkAdd([
      { id: 'c1', itemId: 'item-1', dayKey: '2026-10-12', createdAt: 1 },
      { id: 'c2', itemId: 'item-1', dayKey: '2026-10-13', createdAt: 2 },
    ]);
    renderToday(ctx);

    const risky = await screen.findByRole('img', { name: '2 day streak, not done today' });
    expect(risky).toHaveTextContent('🔥 2');
    expect(risky.classList.contains('risk')).toBe(true);

    await fireEvent.click(await checkbox('Meditate'));
    const extended = await screen.findByRole('img', { name: '3 day streak' });
    expect(extended.classList.contains('risk')).toBe(false);
  });

  it('shows no badge when a day was missed', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    await ctx.db.completions.bulkAdd([
      { id: 'c1', itemId: 'item-1', dayKey: '2026-10-11', createdAt: 1 },
      { id: 'c2', itemId: 'item-1', dayKey: '2026-10-12', createdAt: 2 },
    ]);
    renderToday(ctx);
    await checkbox('Meditate');
    expect(screen.queryByRole('img', { name: /streak/ })).toBeNull();
  });

  it('groups habits under their lists in list order', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Stretch', 'list-1');
    await ctx.itemsRepo.create({ title: 'Inbox zero', listId: 'list-2', type: 'daily' });
    await ctx.listsRepo.move('list-2', 'up'); // Work now comes before Fitness
    renderToday(ctx);
    await checkbox('Stretch');

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.querySelector('.name')?.textContent)).toEqual([
      'Work',
      'Fitness',
    ]);
    const sections = screen.getAllByRole('region');
    expect(within(sections[0]!).getByRole('checkbox', { name: 'Inbox zero' })).toBeInTheDocument();
    expect(within(sections[1]!).getByRole('checkbox', { name: 'Stretch' })).toBeInTheDocument();
  });

  it('keeps checked habits in their original place', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'First');
    await ctx.itemsRepo.create({ title: 'Second', listId: 'list-1', type: 'daily' });
    await ctx.itemsRepo.create({ title: 'Third', listId: 'list-1', type: 'daily' });
    renderToday(ctx);
    await fireEvent.click(await checkbox('First'));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'First' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-label'))).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('starts a new day by itself: checkmarks clear and the date changes', async () => {
    const ctx = setup(new Date(2026, 9, 14, 23, 59, 50));
    await seedHabit(ctx, 'Meditate');
    await ctx.db.completions.add({ id: 'c1', itemId: 'item-1', dayKey: '2026-10-14', createdAt: 1 });
    renderToday(ctx);
    const box = await checkbox('Meditate');
    expect(box).toHaveAttribute('aria-checked', 'true');

    ctx.rollTo(new Date(2026, 9, 15, 0, 0, 1));

    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText('Thursday, October 15')).toBeInTheDocument();
    const badge = screen.getByRole('img', { name: '1 day streak, not done today' });
    expect(badge.classList.contains('risk')).toBe(true);
  });

  it('records a tap on a stale screen against the real current day', async () => {
    const ctx = setup(new Date(2026, 9, 14, 23, 59, 50));
    await seedHabit(ctx, 'Meditate');
    renderToday(ctx);
    const box = await checkbox('Meditate');

    ctx.setNow(new Date(2026, 9, 15, 0, 0, 5)); // midnight passed; no rollover signal yet
    await fireEvent.click(box);

    await waitFor(async () =>
      expect((await completions(ctx)).map((c) => c.dayKey)).toEqual(['2026-10-15']),
    );
    expect(screen.getByText('Thursday, October 15')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('leaves a consistent record after two fast taps', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    renderToday(ctx);
    const box = await checkbox('Meditate');

    fireEvent.click(box);
    fireEvent.click(box);

    await waitFor(async () => expect(await completions(ctx)).toHaveLength(0));
    expect(box).toHaveAttribute('aria-checked', 'false');
  });

  it('shows habit names containing HTML as plain text', async () => {
    const ctx = setup();
    await seedHabit(ctx, '<img src=x onerror=alert(1)>');
    renderToday(ctx);

    expect(await checkbox('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it("drops a deleted list's habits from Today but keeps their history", async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Stretch', 'list-1');
    await ctx.itemsRepo.create({ title: 'Inbox zero', listId: 'list-2', type: 'daily' });
    await ctx.itemsRepo.toggleDay('item-1', '2026-10-13');
    await ctx.listsRepo.remove('list-1');
    renderToday(ctx);

    await checkbox('Inbox zero');
    expect(screen.queryByRole('checkbox', { name: 'Stretch' })).toBeNull();
    expect((await ctx.db.items.get('item-1'))?.archivedAt).toBe(1_000);
    expect(await completions(ctx)).toHaveLength(1);
  });

  it('stops watching the clock when it goes away', async () => {
    const ctx = setup();
    const view = renderToday(ctx);
    await screen.findByText(EMPTY);
    expect(ctx.isStopped()).toBe(false);
    view.unmount();
    expect(ctx.isStopped()).toBe(true);
  });

  it('reverts a check-off that could not be saved and says so', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    renderToday(ctx);
    const box = await checkbox('Meditate');
    ctx.db.close();

    await fireEvent.click(box);

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'false'));
  });

  it('keeps the sheet open when a new habit could not be saved', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);
    ctx.db.close();

    await addHabit('Meditate');

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a failure to load the lists instead of an empty screen', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    ctx.db.close();
    renderToday(ctx);

    expect(await screen.findByRole('status')).toHaveTextContent(LOAD_ERROR);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('reports a failure to load the habits when only that part fails', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    const lists = await ctx.listsRepo.getAll();
    ctx.db.close();
    // The lists load fine here; reading the habits from the closed database fails.
    const listsRepo = {
      ...ctx.listsRepo,
      ensureStarterLists: async () => ({ ok: true as const, value: undefined }),
      getAll: async () => lists,
    };
    render(Today, { props: { listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock } });

    expect(await screen.findByRole('status')).toHaveTextContent(ITEMS_LOAD_ERROR);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('reports a failure to load the history when only that part fails', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    const itemsRepo = {
      ...ctx.itemsRepo,
      completionDays: async () => ({ ok: false as const, error: ITEMS_LOAD_ERROR }),
    };
    render(Today, { props: { listsRepo: ctx.listsRepo, itemsRepo, clock: ctx.clock } });

    expect(await screen.findByRole('status')).toHaveTextContent(ITEMS_LOAD_ERROR);
    expect(screen.queryByRole('checkbox', { name: 'Meditate' })).toBeNull();
  });
});
