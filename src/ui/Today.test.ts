import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { ITEMS_LOAD_ERROR } from '../data/items-repo';
import { LOAD_ERROR, SAVE_ERROR } from '../data/lists-repo';
import { STARTER_LISTS } from '../domain/lists';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';
import Today from './Today.svelte';

const EMPTY = 'Nothing here yet. Tap + to add your first habit or to-do.';

const setup = (start?: Date) => setupApp(start, 'today-ui');
type Ctx = AppCtx;

/** Every screen behind the hash router, starting on Today. */
function renderApp(ctx: Ctx) {
  location.hash = '';
  return render(Router, { props: routerProps(ctx) });
}

/** From Today: tap the item's name to open its page, then tap Edit there. */
async function openEdit(title: string, nth = 0) {
  const links = await screen.findAllByRole('link', { name: `${title} details` });
  await fireEvent.click(links[nth]!);
  await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
}

/** From a detail page, back to the screen it was opened from. */
async function goBack() {
  await fireEvent.click(await screen.findByRole('link', { name: 'Back' }));
}

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

/** Taps + (which opens a to-do) and switches the Type to `kind`. */
async function startAdding(kind = 'Daily habit') {
  await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await fireEvent.click(screen.getByRole('radio', { name: kind }));
}

async function addHabit(name: string, listId?: string) {
  await startAdding();
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
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('opens a to-do due today, ready to type, with the type switch showing', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const dialog = screen.getByRole('dialog', { name: 'New to-do' });
    const types = within(dialog).getByRole('group', { name: 'Type' });
    expect(within(types).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent?.trim())).toEqual([
      'To-do',
      'Daily habit',
      'Weekly goal',
    ]);
    expect(within(types).getByRole('radio', { name: 'To-do' })).toBeChecked();
    expect(types).toHaveAccessibleDescription('Once, with an optional due date');
    expect(within(dialog).getByLabelText('Due')).toHaveDisplayValue('Today');
    await waitFor(() => expect(within(dialog).getByLabelText('Name')).toHaveFocus());
    expect(within(dialog).queryByLabelText('Repeats')).toBeNull();

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await ctx.db.items.count()).toBe(0);
  });

  it('saves a quick to-do due today from just a name', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Pick up dry cleaning' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const box = await checkbox('Pick up dry cleaning');
    expect(within(box.closest('li')!).getByText('Today')).toBeInTheDocument();
    expect(await ctx.db.items.toArray()).toMatchObject([
      { title: 'Pick up dry cleaning', type: 'todo', dueDate: '2026-10-14' },
    ]);
  });

  it('keeps the name when the type is switched, and switching back restores Due', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Meditate' } });

    await fireEvent.click(screen.getByRole('radio', { name: 'Weekly goal' }));
    expect(screen.getByRole('dialog', { name: 'New weekly goal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Times per week')).toHaveValue('3');
    expect(screen.queryByLabelText('Due')).toBeNull();
    await fireEvent.click(screen.getByRole('radio', { name: 'To-do' }));
    expect(screen.getByLabelText('Due')).toHaveDisplayValue('Today');

    await fireEvent.click(screen.getByRole('radio', { name: 'Daily habit' }));
    expect(screen.getByRole('group', { name: 'Type' })).toHaveAccessibleDescription('Every day, with a streak');
    expect(screen.getByLabelText('Name')).toHaveValue('Meditate');
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await checkbox('Meditate');
    const [stored] = await ctx.db.items.toArray();
    expect(stored).toMatchObject({ title: 'Meditate', type: 'daily' });
    expect(stored).not.toHaveProperty('dueDate');
  });

  it('saves each choice as its own type', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);
    for (const [kind, name] of [
      ['Daily habit', 'A'],
      ['Weekly goal', 'B'],
      ['To-do', 'C'],
    ] as const) {
      // (This also covers choosing To-do explicitly after the sheet opens on it.)
      await startAdding(kind);
      expect(screen.getByRole('dialog', { name: `New ${kind.toLowerCase()}` })).toBeInTheDocument();
      await fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } });
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    const stored = (await ctx.db.items.toArray()).sort((a, b) => a.title.localeCompare(b.title));
    expect(stored.map((item) => item.type)).toEqual(['daily', 'weekly', 'todo']);
    expect(await ctx.db.targetHistory.toArray()).toEqual([
      { itemId: 'item-2', effectiveWeekStart: '2026-10-11', target: 3 },
    ]);
  });

  it('adds a habit under its list with no streak badge yet', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await startAdding('Daily habit');
    const dialog = screen.getByRole('dialog', { name: 'New daily habit' });
    expect(within(dialog).queryByLabelText('Times per week')).toBeNull();
    expect(within(dialog).queryByLabelText('Due')).toBeNull();
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

    await startAdding();
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

    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
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
    await ctx.listsRepo.moveTo('list-2', 0); // Work now comes before Fitness
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

  it('reports a failure to load the target history when only that part fails', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
    const itemsRepo = {
      ...ctx.itemsRepo,
      listTargets: async () => ({ ok: false as const, error: ITEMS_LOAD_ERROR }),
    };
    render(Today, { props: { listsRepo: ctx.listsRepo, itemsRepo, clock: ctx.clock } });

    expect(await screen.findByRole('status')).toHaveTextContent(ITEMS_LOAD_ERROR);
    expect(screen.queryByRole('button', { name: /^Log Peloton ride/ })).toBeNull();
  });
});

describe('editing and deleting', () => {
  // Edit lives on each habit's page now, so these run the whole app.
  const renderToday = renderApp;

  async function deleteViaSheet() {
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
  }

  it('opens an edit sheet for a daily habit from its name, without checking it off', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', 'list-4');
    renderToday(ctx);

    await openEdit('Meditate');

    const dialog = screen.getByRole('dialog', { name: 'Edit habit' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Meditate');
    expect(within(dialog).getByLabelText('List')).toHaveValue('list-4');
    expect(within(dialog).queryByLabelText('Repeats')).toBeNull();
    expect(within(dialog).queryByLabelText('Times per week')).toBeNull();
    expect(await completions(ctx)).toHaveLength(0);
  });

  it('renames and moves a daily habit and keeps its streak', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', 'list-4');
    await ctx.itemsRepo.toggleDay('item-1', '2026-10-13');
    await ctx.itemsRepo.toggleDay('item-1', '2026-10-14');
    renderToday(ctx);

    await openEdit('Meditate');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Meditate 10 min' } });
    await fireEvent.change(screen.getByLabelText('List'), { target: { value: 'list-1' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Meditate 10 min' }),
    ).toBeInTheDocument();
    await goBack();

    expect(await checkbox('Meditate 10 min')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('img', { name: '2 day streak' })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.querySelector('.name')?.textContent)).toEqual(['Fitness']);
  });

  it('asks before deleting, and Cancel goes back to editing with nothing changed', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    renderToday(ctx);

    await openEdit('Meditate');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete "Meditate"? Its history is kept, but it leaves Today.');
    const buttons = within(dialog).getAllByRole('button').map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Cancel', 'Delete']);
    expect(within(dialog).getByRole('button', { name: 'Delete' }).classList.contains('danger')).toBe(
      true,
    );

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Meditate');
    expect((await ctx.db.items.get('item-1'))?.archivedAt).toBeUndefined();
  });

  it('deletes a duplicate daily habit and keeps the weekly goal with the same name', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Peloton ride');
    await ctx.itemsRepo.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
    renderToday(ctx);
    await checkbox('Peloton ride');

    // Both items are called "Peloton ride"; the daily one was added first, so it is listed first.
    await openEdit('Peloton ride', 0);
    expect(screen.getByRole('dialog', { name: 'Edit habit' })).toBeInTheDocument();
    await deleteViaSheet();

    // Deleting goes back to Today, where only the weekly goal is left.
    expect(await screen.findByRole('button', { name: /^Log Peloton ride/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Peloton ride' })).toBeNull();
    expect(location.hash).toBe('#/today');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await ctx.db.items.get('item-1'))?.archivedAt).toBeDefined();
    expect((await ctx.db.items.get('item-2'))?.archivedAt).toBeUndefined();
  });

  it('deletes a weekly goal but keeps its logs and target history', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
    await ctx.itemsRepo.addCompletion('item-1', '2026-10-12');
    await ctx.itemsRepo.addCompletion('item-1', '2026-10-13');
    renderToday(ctx);

    await openEdit('Peloton ride');
    expect(screen.getByRole('dialog', { name: 'Edit weekly goal' })).toBeInTheDocument();
    await deleteViaSheet();

    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(await ctx.db.completions.count()).toBe(2);
    expect(await ctx.db.targetHistory.count()).toBe(1);
  });

  it('removes the list header when its last item is deleted', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Stretch', 'list-1');
    await ctx.itemsRepo.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    renderToday(ctx);
    await checkbox('Meditate');

    await openEdit('Meditate');
    await deleteViaSheet();

    await waitFor(() =>
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((h) => h.querySelector('.name')?.textContent),
      ).toEqual(['Fitness']),
    );
  });

  it('keeps the item and shows the error when deleting fails', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    renderToday(ctx);
    await openEdit('Meditate');
    ctx.db.close();

    await deleteViaSheet();

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Meditate' })).toBeInTheDocument();
  });

  it('refuses a blank name for a daily habit and keeps the sheet open', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate');
    renderToday(ctx);

    await openEdit('Meditate');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: ' ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be empty");
    expect(screen.getByRole('dialog', { name: 'Edit habit' })).toBeInTheDocument();
  });

  it('shows a name with HTML as plain text in the delete confirmation', async () => {
    const ctx = setup();
    await seedHabit(ctx, '<img src=x onerror=alert(1)>');
    renderToday(ctx);

    await openEdit('<img src=x onerror=alert(1)>');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Delete "<img src=x onerror=alert(1)>"?');
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('does not offer Delete when adding a new habit', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);
    await startAdding();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

describe('weekly goals on Today', () => {
  const ringName = (title: string, count: number, target: number, met = false) =>
    `Log ${title}, ${count} of ${target} this week${met ? ', goal met' : ''}`;
  const ring = (title: string, count: number, target: number, met = false) =>
    screen.findByRole('button', { name: ringName(title, count, target, met) });
  const saturdayNight = new Date(2026, 9, 17, 23, 59, 50);
  const sundayMorning = new Date(2026, 9, 18, 0, 0, 5);

  async function seedGoal(ctx: Ctx, title = 'Peloton ride', target = 3, listId = 'list-1') {
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title, listId, type: 'weekly', target });
  }

  async function addLogs(ctx: Ctx, itemId: string, days: string[]) {
    await ctx.db.completions.bulkAdd(
      days.map((dayKey, index) => ({
        id: `log-${dayKey}-${index}`,
        itemId,
        dayKey,
        createdAt: index + 1,
      })),
    );
  }

  async function openNewWeekly(name: string) {
    await startAdding('Weekly goal');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } });
  }

  it('asks for times per week when Weekly goal is chosen', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);
    await startAdding('Weekly goal');

    expect(screen.getByRole('dialog', { name: 'New weekly goal' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Due')).toBeNull();
    const target = screen.getByLabelText('Times per week');
    expect(target).toHaveValue('3');
    expect(within(target).getAllByRole('option').map((o) => o.textContent)).toEqual(
      Array.from({ length: 14 }, (_, i) => String(i + 1)),
    );
  });

  it('adds a weekly goal under its list with its target recorded from this week', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await openNewWeekly('Peloton ride');
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await ring('Peloton ride', 0, 3)).toHaveTextContent('0/3');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Fitness');
    expect(screen.queryByRole('button', { name: /Remove last/ })).toBeNull();
    expect(screen.queryByRole('img', { name: /streak/ })).toBeNull();
    expect(await ctx.db.targetHistory.toArray()).toEqual([
      { itemId: 'item-1', effectiveWeekStart: '2026-10-11', target: 3 },
    ]);
  });

  it('keeps the sheet open with a message when a weekly goal has no name', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);

    await openNewWeekly('   ');
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be empty");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows weekly goals beside daily habits in their saved order', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Stretch');
    await ctx.itemsRepo.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
    renderToday(ctx);
    await ring('Peloton ride', 0, 3);

    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByRole('checkbox', { name: 'Stretch' })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: /^Log Peloton ride/ })).toBeInTheDocument();
  });

  it('logs one completion per tap, reaches the goal, and keeps counting past it', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderToday(ctx);

    await fireEvent.click(await ring('Peloton ride', 0, 3));
    expect(await ring('Peloton ride', 1, 3)).toHaveTextContent('1/3');
    await fireEvent.click(await ring('Peloton ride', 1, 3));
    await fireEvent.click(await ring('Peloton ride', 2, 3));
    expect(await ring('Peloton ride', 3, 3, true)).toHaveTextContent('3/3');
    await fireEvent.click(await ring('Peloton ride', 3, 3, true));
    expect(await ring('Peloton ride', 4, 3, true)).toHaveTextContent('4/3');

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(async () => expect(await ctx.db.completions.count()).toBe(4));
    expect((await ctx.db.completions.toArray()).every((c) => c.dayKey === '2026-10-14')).toBe(true);
  });

  it('counts two quick taps as two completions, not a toggle', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderToday(ctx);
    const button = await ring('Peloton ride', 0, 3);

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(async () => expect(await ctx.db.completions.count()).toBe(2));
    await ring('Peloton ride', 2, 3);
  });

  it('removes the most recent log with the minus button, which disappears at zero', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    await addLogs(ctx, 'item-1', ['2026-10-12', '2026-10-14']);
    renderToday(ctx);
    await ring('Peloton ride', 2, 3);

    await fireEvent.click(screen.getByRole('button', { name: 'Remove last Peloton ride log' }));
    await ring('Peloton ride', 1, 3);
    await waitFor(async () =>
      expect((await ctx.db.completions.toArray()).map((c) => c.dayKey)).toEqual(['2026-10-12']),
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Remove last Peloton ride log' }));
    await ring('Peloton ride', 0, 3);
    expect(screen.queryByRole('button', { name: /Remove last/ })).toBeNull();
    await waitFor(async () => expect(await ctx.db.completions.count()).toBe(0));
  });

  it('remembers logs after the app is reopened', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    const first = renderToday(ctx);
    await fireEvent.click(await ring('Peloton ride', 0, 3));
    await fireEvent.click(await ring('Peloton ride', 1, 3));
    await waitFor(async () => expect(await ctx.db.completions.count()).toBe(2));

    first.unmount();
    renderToday(ctx);
    expect(await ring('Peloton ride', 2, 3)).toHaveTextContent('2/3');
  });

  it('shows the weekly streak dimmed until this week is met, then extends it', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    await ctx.db.targetHistory.put({ itemId: 'item-1', effectiveWeekStart: '2026-09-20', target: 3 });
    await addLogs(ctx, 'item-1', [
      '2026-09-20', '2026-09-21', '2026-09-22',
      '2026-09-27', '2026-09-28', '2026-09-29',
      '2026-10-04', '2026-10-05', '2026-10-06',
      '2026-10-11',
    ]);
    renderToday(ctx);

    const risky = await screen.findByRole('img', { name: '3 week streak, not met yet this week' });
    expect(risky).toHaveTextContent('🔥 3');
    expect(risky.classList.contains('risk')).toBe(true);

    await fireEvent.click(await ring('Peloton ride', 1, 3));
    await fireEvent.click(await ring('Peloton ride', 2, 3));
    const extended = await screen.findByRole('img', { name: '4 week streak' });
    expect(extended.classList.contains('risk')).toBe(false);
  });

  it('resets the ring by itself when the app stays open across Saturday midnight', async () => {
    const ctx = setup(saturdayNight);
    await seedGoal(ctx);
    await addLogs(ctx, 'item-1', ['2026-10-11', '2026-10-12', '2026-10-13']);
    renderToday(ctx);
    await ring('Peloton ride', 3, 3, true);

    ctx.rollTo(sundayMorning);

    expect(await ring('Peloton ride', 0, 3)).toHaveTextContent('0/3');
    expect(screen.getByText('Sunday, October 18')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '1 week streak, not met yet this week' }),
    ).toBeInTheDocument();
  });

  it('counts a tap on a stale screen just after Saturday midnight for the new week', async () => {
    const ctx = setup(saturdayNight);
    await seedGoal(ctx);
    await addLogs(ctx, 'item-1', ['2026-10-11', '2026-10-12', '2026-10-13']);
    renderToday(ctx);
    const button = await ring('Peloton ride', 3, 3, true);

    ctx.setNow(sundayMorning); // the week changed; no rollover signal yet
    await fireEvent.click(button);

    await ring('Peloton ride', 1, 3);
    await waitFor(async () =>
      expect((await ctx.db.completions.toArray()).map((c) => c.dayKey).sort().at(-1)).toBe(
        '2026-10-18',
      ),
    );
    expect(screen.getByText('Sunday, October 18')).toBeInTheDocument();
  });

  it('leaves the old week alone when minus is tapped on a screen that is a week behind', async () => {
    const ctx = setup(saturdayNight);
    await seedGoal(ctx);
    await addLogs(ctx, 'item-1', ['2026-10-11', '2026-10-12', '2026-10-13']);
    renderToday(ctx);
    const minus = await screen.findByRole('button', { name: 'Remove last Peloton ride log' });

    ctx.setNow(sundayMorning);
    await fireEvent.click(minus);

    await ring('Peloton ride', 0, 3);
    expect(await ctx.db.completions.count()).toBe(3);
  });

  it('opens an edit sheet from the goal’s page without logging anything', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderApp(ctx);
    await ring('Peloton ride', 0, 3);

    await openEdit('Peloton ride');

    const dialog = screen.getByRole('dialog', { name: 'Edit weekly goal' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Peloton ride');
    expect(within(dialog).getByLabelText('List')).toHaveValue('list-1');
    expect(within(dialog).getByLabelText('Times per week')).toHaveValue('3');
    expect(within(dialog).queryByLabelText('Repeats')).toBeNull();
    expect(await ctx.db.completions.count()).toBe(0);
  });

  it('saves a new target and shows it in the ring', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderApp(ctx);
    await ring('Peloton ride', 0, 3);

    await openEdit('Peloton ride');
    await fireEvent.change(screen.getByLabelText('Times per week'), { target: { value: '4' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await goBack();

    expect(await ring('Peloton ride', 0, 4)).toHaveTextContent('0/4');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await ctx.db.targetHistory.toArray()).toEqual([
      { itemId: 'item-1', effectiveWeekStart: '2026-10-11', target: 4 },
    ]);
  });

  it('renames and moves a goal without losing its logs', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    await addLogs(ctx, 'item-1', ['2026-10-12', '2026-10-13']);
    renderApp(ctx);
    await ring('Peloton ride', 2, 3);

    await openEdit('Peloton ride');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Spin class' } });
    await fireEvent.change(screen.getByLabelText('List'), { target: { value: 'list-4' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { level: 1, name: 'Spin class' });
    await goBack();

    expect(await ring('Spin class', 2, 3)).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.querySelector('.name')?.textContent)).toEqual(['Personal']);
  });

  it('changes nothing when the edit is cancelled', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderApp(ctx);
    await ring('Peloton ride', 0, 3);

    await openEdit('Peloton ride');
    await fireEvent.change(screen.getByLabelText('Times per week'), { target: { value: '6' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    await goBack();
    await ring('Peloton ride', 0, 3);
  });

  it('keeps the edit sheet open with a message when the name is blank', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderApp(ctx);
    await ring('Peloton ride', 0, 3);

    await openEdit('Peloton ride');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: ' ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be empty");
    expect(screen.getByRole('dialog', { name: 'Edit weekly goal' })).toBeInTheDocument();
  });

  it('keeps the edit sheet open when the change could not be saved', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderApp(ctx);
    await ring('Peloton ride', 0, 3);

    await openEdit('Peloton ride');
    ctx.db.close();
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR);
    expect(screen.getByRole('dialog', { name: 'Edit weekly goal' })).toBeInTheDocument();
  });

  it('reverts a log that could not be saved and says so', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderToday(ctx);
    const button = await ring('Peloton ride', 0, 3);
    ctx.db.close();

    await fireEvent.click(button);

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    await ring('Peloton ride', 0, 3);
  });

  it('reverts a removal that could not be saved and says so', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    await addLogs(ctx, 'item-1', ['2026-10-14']);
    renderToday(ctx);
    await ring('Peloton ride', 1, 3);
    const minus = screen.getByRole('button', { name: 'Remove last Peloton ride log' });
    ctx.db.close();

    await fireEvent.click(minus);

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    await ring('Peloton ride', 1, 3);
  });

  it('keeps the new-goal sheet open when saving fails', async () => {
    const ctx = setup();
    renderToday(ctx);
    await screen.findByText(EMPTY);
    ctx.db.close();

    await openNewWeekly('Peloton ride');
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it("drops a deleted list's weekly goals from Today but keeps their history", async () => {
    const ctx = setup();
    await seedGoal(ctx);
    await addLogs(ctx, 'item-1', ['2026-10-12']);
    await ctx.listsRepo.remove('list-1');
    renderToday(ctx);

    await screen.findByText(EMPTY);
    expect(screen.queryByRole('button', { name: /^Log Peloton ride/ })).toBeNull();
    expect((await ctx.db.items.get('item-1'))?.archivedAt).toBe(1_000);
    expect(await ctx.db.completions.count()).toBe(1);
    expect(await ctx.db.targetHistory.count()).toBe(1);
  });

  it('shows weekly goal names containing HTML as plain text', async () => {
    const ctx = setup();
    await seedGoal(ctx, '<img src=x onerror=alert(1)>');
    renderToday(ctx);

    expect(
      await ring('<img src=x onerror=alert(1)>', 0, 3),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });
});
