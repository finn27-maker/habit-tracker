import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { SAVE_ERROR } from '../data/errors';
import { setupApp, type AppCtx } from '../testing/app-fixture';
import ListPage from './ListPage.svelte';
import Today from './Today.svelte';

/** Short enough to keep tests quick, long enough to tap again before it ends. */
const LINGER = 40;

const setup = (start?: Date) => setupApp(start, 'todos-ui');

const renderToday = (ctx: AppCtx, lingerMs = LINGER) =>
  render(Today, {
    props: { listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock, lingerMs },
  });

const EMPTY = 'Nothing here yet. Tap + to add your first habit or to-do.';

/** Today with nothing in it yet, once the starter lists have loaded. */
async function renderEmptyToday(ctx: AppCtx) {
  renderToday(ctx);
  await screen.findByText(EMPTY);
}

const renderList = (ctx: AppCtx, listId = 'list-4', lingerMs = LINGER) =>
  render(ListPage, {
    props: { listId, listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock, lingerMs },
  });

/** Starter lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function seedTodo(ctx: AppCtx, title: string, extra: { listId?: string; dueDate?: string } = {}) {
  await ctx.listsRepo.ensureStarterLists();
  const created = await ctx.itemsRepo.create({
    title,
    listId: extra.listId ?? 'list-4',
    type: 'todo',
    ...(extra.dueDate ? { dueDate: extra.dueDate } : {}),
  });
  if (!created.ok) throw new Error(created.error);
  return created.value.id;
}

const checkbox = (name: string) => screen.findByRole('checkbox', { name });
const rowOf = (box: HTMLElement) => box.closest('li') as HTMLElement;
const stored = (ctx: AppCtx, id: string) => ctx.db.items.get(id);
const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);
const checkboxNames = (container: HTMLElement) =>
  within(container)
    .getAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label'));

async function openNewSheet(name: string, type = 'todo') {
  await fireEvent.click(await screen.findByRole('button', { name: 'New habit' }));
  await fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } });
  await fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: type } });
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('adding to-dos', () => {
  it('offers Once (to-do), which swaps the weekly target for a Due choice', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await fireEvent.click(await screen.findByRole('button', { name: 'New habit' }));

    expect(optionTexts(screen.getByLabelText('Repeats'))).toEqual([
      'Every day',
      'Times a week',
      'Once (to-do)',
    ]);
    await fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'todo' } });

    const due = screen.getByLabelText('Due');
    expect(due).toHaveDisplayValue('Today');
    expect(optionTexts(due)).toEqual(['No date', 'Today', 'Tomorrow', 'Pick a date']);
    expect(screen.queryByLabelText('Times per week')).toBeNull();
    expect(screen.queryByLabelText('Date')).toBeNull();
  });

  it('fills the date field in when "Pick a date" is chosen', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await openNewSheet('Book flights');
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'pick' } });
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-16');
  });

  it('adds an undated to-do to Today with no date label', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await openNewSheet('Clean garage');
    await fireEvent.change(screen.getByLabelText('List'), { target: { value: 'list-4' } });
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'none' } });
    await save();

    const box = await checkbox('Clean garage');
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('region', { name: 'Personal' })).toContainElement(box);
    expect(rowOf(box).querySelector('.due')).toBeNull();
    expect(await stored(ctx, 'item-1')).toMatchObject({ type: 'todo', title: 'Clean garage' });
    expect(await stored(ctx, 'item-1')).not.toHaveProperty('dueDate');
  });

  it('makes a to-do due today when Due is left alone, labelled "Today"', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await openNewSheet('Call accountant');
    await save();

    const box = await checkbox('Call accountant');
    expect(within(rowOf(box)).getByText('Today')).toBeInTheDocument();
    expect((await stored(ctx, 'item-1'))?.dueDate).toBe('2026-10-14');
  });

  it('makes a to-do saved just after midnight due on the new day', async () => {
    const ctx = setup(new Date(2026, 9, 14, 23, 59, 50));
    await renderEmptyToday(ctx);
    await openNewSheet('Call accountant');
    ctx.rollTo(new Date(2026, 9, 15, 0, 0, 5));
    await save();

    await waitFor(async () => expect((await stored(ctx, 'item-1'))?.dueDate).toBe('2026-10-15'));
  });

  it('gives daily habits no due date', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await openNewSheet('Meditate', 'daily');
    await save();

    await checkbox('Meditate');
    expect(await stored(ctx, 'item-1')).not.toHaveProperty('dueDate');
  });

  it('keeps tomorrow and picked future dates off Today', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await openNewSheet('Call mom');
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'tomorrow' } });
    await save();
    await openNewSheet('Book flights');
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'pick' } });
    await fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2026-10-20' } });
    await save();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect((await stored(ctx, 'item-1'))?.dueDate).toBe('2026-10-15');
    expect((await stored(ctx, 'item-2'))?.dueDate).toBe('2026-10-20');
  });

  it('asks for a real date when the picked date is empty or invalid', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await openNewSheet('Book flights');
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'pick' } });
    // A browser date field holds '' for anything that is not a real date, like 2026-02-30.
    await fireEvent.input(screen.getByLabelText('Date'), { target: { value: '' } });
    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a valid date');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(await ctx.db.items.count()).toBe(0);
  });

  it('needs a name', async () => {
    const ctx = setup();
    await renderEmptyToday(ctx);
    await openNewSheet('  ');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be empty");
  });
});

describe('to-dos on Today', () => {
  it('lists to-dos after habits: overdue first, then due today, then undated', async () => {
    const ctx = setup();
    await seedTodo(ctx, 'Clean garage');
    await seedTodo(ctx, 'Call mom', { dueDate: '2026-10-14' });
    await ctx.itemsRepo.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    await seedTodo(ctx, 'Renew license', { dueDate: '2026-10-12' });
    await seedTodo(ctx, 'Old bill', { dueDate: '2026-10-09' });
    await seedTodo(ctx, 'Book flights', { dueDate: '2026-10-20' });
    renderToday(ctx);
    await checkbox('Clean garage');

    expect(checkboxNames(screen.getByRole('region', { name: 'Personal' }))).toEqual([
      'Meditate',
      'Old bill',
      'Renew license',
      'Call mom',
      'Clean garage',
    ]);
    const overdue = within(rowOf(await checkbox('Renew license'))).getByText('2 days overdue');
    expect(overdue).toHaveClass('overdue');
    expect(within(rowOf(await checkbox('Call mom'))).getByText('Today')).not.toHaveClass('overdue');
  });

  it('shows a check at once, then moves a checked-off to-do out of Today', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Clean garage');
    renderToday(ctx);
    const box = await checkbox('Clean garage');

    await fireEvent.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Clean garage' })).toBe(box);

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Clean garage' })).toBeNull());
    expect((await stored(ctx, id))?.completedAt).toBe(new Date(2026, 9, 14, 9, 0).getTime());
  });

  it('undoes the check-off when tapped again before it moves', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Clean garage');
    renderToday(ctx, 60_000);
    const box = await checkbox('Clean garage');

    await fireEvent.click(box);
    await waitFor(async () => expect((await stored(ctx, id))?.completedAt).toBeDefined());
    await fireEvent.click(box);

    expect(box).toHaveAttribute('aria-checked', 'false');
    await waitFor(async () => expect(await stored(ctx, id)).not.toHaveProperty('completedAt'));
    expect(screen.getByRole('checkbox', { name: 'Clean garage' })).toBe(box);
  });

  it('stays gone after the app is reopened', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Clean garage');
    const first = renderToday(ctx, 60_000);
    await fireEvent.click(await checkbox('Clean garage'));
    await waitFor(async () => expect((await stored(ctx, id))?.completedAt).toBeDefined());
    first.unmount(); // also cancels the pending linger timer

    renderToday(ctx);
    await screen.findByText('Nothing here yet. Tap + to add your first habit or to-do.');
    expect(screen.queryByRole('checkbox', { name: 'Clean garage' })).toBeNull();
  });

  it('reverts a check-off that could not be saved and says so', async () => {
    const ctx = setup();
    await seedTodo(ctx, 'Clean garage');
    renderToday(ctx);
    const box = await checkbox('Clean garage');
    ctx.db.close();

    await fireEvent.click(box);

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'false'));
    await new Promise((resolve) => setTimeout(resolve, LINGER * 2));
    expect(screen.getByRole('checkbox', { name: 'Clean garage' })).toBe(box);
  });

  it('leaves habit streaks and weekly counts alone', async () => {
    const ctx = setup();
    await seedTodo(ctx, 'Clean garage');
    await ctx.itemsRepo.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    await ctx.itemsRepo.toggleDay('item-2', '2026-10-14');
    renderToday(ctx);

    await fireEvent.click(await checkbox('Clean garage'));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Clean garage' })).toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('img', { name: '1 day streak' })).toBeInTheDocument();
    expect(await ctx.db.completions.count()).toBe(1);
  });

  it('brings future to-dos in and makes today’s overdue when the day changes', async () => {
    const ctx = setup(new Date(2026, 9, 14, 23, 59, 50));
    await seedTodo(ctx, 'Book flights', { dueDate: '2026-10-15' });
    await seedTodo(ctx, 'Call mom', { dueDate: '2026-10-14' });
    renderToday(ctx);
    await checkbox('Call mom');
    expect(screen.queryByRole('checkbox', { name: 'Book flights' })).toBeNull();

    ctx.rollTo(new Date(2026, 9, 15, 0, 0, 5));

    const flights = await checkbox('Book flights');
    expect(within(rowOf(flights)).getByText('Today')).toBeInTheDocument();
    expect(within(rowOf(await checkbox('Call mom'))).getByText('1 day overdue')).toBeInTheDocument();
  });

  it('shows names with HTML as plain text', async () => {
    const ctx = setup();
    await seedTodo(ctx, '<img src=x onerror=alert(1)>');
    const { container } = renderToday(ctx);
    expect(await checkbox('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('editing to-dos', () => {
  const openEdit = async (title: string) =>
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${title}` }));

  it('opens "Edit to-do" with the name, list and Due choice', async () => {
    const ctx = setup();
    await seedTodo(ctx, 'Clean garage');
    renderToday(ctx);
    await openEdit('Clean garage');

    expect(screen.getByRole('dialog', { name: 'Edit to-do' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Clean garage');
    expect(screen.getByLabelText('List')).toHaveValue('list-4');
    expect(screen.getByLabelText('Due')).toHaveDisplayValue('No date');
    expect(screen.queryByLabelText('Repeats')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Clean garage' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it.each([
    ['2026-10-14', 'Today'],
    ['2026-10-12', 'Pick a date'],
  ])('starts a to-do due %s on "%s"', async (dueDate, choice) => {
    const ctx = setup();
    await seedTodo(ctx, 'Call mom', { dueDate });
    renderToday(ctx);
    await openEdit('Call mom');
    expect(screen.getByLabelText('Due')).toHaveDisplayValue(choice);
    if (choice === 'Pick a date') expect(screen.getByLabelText('Date')).toHaveValue(dueDate);
  });

  it('starts a to-do due tomorrow on "Tomorrow" (from its list page)', async () => {
    const ctx = setup();
    await seedTodo(ctx, 'Call mom', { dueDate: '2026-10-15' });
    renderList(ctx);
    await openEdit('Call mom');
    expect(screen.getByLabelText('Due')).toHaveDisplayValue('Tomorrow');
  });

  it('moves a to-do off Today when given a future date', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Clean garage');
    renderToday(ctx);
    await openEdit('Clean garage');
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'pick' } });
    await fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2026-10-20' } });
    await save();

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Clean garage' })).toBeNull());
    expect((await stored(ctx, id))?.dueDate).toBe('2026-10-20');
  });

  it('brings a to-do onto Today when its date is removed', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Call mom', { dueDate: '2026-10-20' });
    const page = renderList(ctx);
    await openEdit('Call mom');
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'none' } });
    await save();
    await waitFor(async () => expect(await stored(ctx, id)).not.toHaveProperty('dueDate'));
    await waitFor(() => expect(rowOf(screen.getByRole('checkbox', { name: 'Call mom' })).querySelector('.due')).toBeNull());
    page.unmount();

    renderToday(ctx);
    const box = await checkbox('Call mom');
    expect(rowOf(box).querySelector('.due')).toBeNull();
  });

  it('deletes a to-do by archiving it', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Clean garage');
    renderToday(ctx);
    await openEdit('Clean garage');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Clean garage' })).toBeNull());
    expect((await stored(ctx, id))?.archivedAt).toBeDefined();
  });
});

describe('list page', () => {
  it('shows the list name, a way back, and everything open in it', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    await ctx.itemsRepo.create({ title: 'Read', listId: 'list-4', type: 'weekly', target: 3 });
    await seedTodo(ctx, 'Clean garage');
    await seedTodo(ctx, 'Book flights', { dueDate: '2026-10-20' });
    await seedTodo(ctx, 'Gym bag', { listId: 'list-1' });
    renderList(ctx);

    expect(await screen.findByRole('heading', { level: 1, name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lists' })).toHaveAttribute('href', '#/lists');
    expect(await checkbox('Clean garage')).toBeInTheDocument();
    expect(checkboxNames(document.body)).toEqual(['Meditate', 'Book flights', 'Clean garage']);
    expect(screen.getByRole('button', { name: /^Log Read/ })).toBeInTheDocument();
    expect(within(rowOf(await checkbox('Book flights'))).getByText('Tue')).toBeInTheDocument();
  });

  it('keeps completed to-dos in a collapsed section, newest first', async () => {
    const ctx = setup();
    const older = await seedTodo(ctx, 'Pay rent');
    const newer = await seedTodo(ctx, 'Clean garage');
    await ctx.db.items.update(older, { completedAt: 1_000 });
    await ctx.db.items.update(newer, { completedAt: 2_000 });
    renderList(ctx);

    const toggle = await screen.findByRole('button', { name: 'Completed (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Nothing in this list yet. Tap + to add something.')).toBeNull();

    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(checkboxNames(document.body)).toEqual(['Clean garage', 'Pay rent']);
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toHaveAttribute('aria-checked', 'true');
    }
  });

  it('restores a completed to-do by unchecking it', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Clean garage');
    await ctx.itemsRepo.setTodoDone(id, true);
    renderList(ctx);
    await fireEvent.click(await screen.findByRole('button', { name: 'Completed (1)' }));

    await fireEvent.click(await checkbox('Clean garage'));

    const box = await checkbox('Clean garage');
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: /^Completed/ })).toBeNull();
    await waitFor(async () => expect(await stored(ctx, id)).not.toHaveProperty('completedAt'));
  });

  it('keeps a to-do in Completed and says so when restoring fails', async () => {
    const ctx = setup();
    const id = await seedTodo(ctx, 'Clean garage');
    await ctx.itemsRepo.setTodoDone(id, true);
    renderList(ctx);
    await fireEvent.click(await screen.findByRole('button', { name: 'Completed (1)' }));
    ctx.db.close();

    await fireEvent.click(await checkbox('Clean garage'));

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Completed (1)' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('checkbox', { name: 'Clean garage' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('moves a checked-off to-do into Completed after the pause', async () => {
    const ctx = setup();
    await seedTodo(ctx, 'Clean garage');
    renderList(ctx);
    await fireEvent.click(await checkbox('Clean garage'));
    expect(screen.queryByRole('button', { name: /^Completed/ })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Completed (1)' })).toBeInTheDocument();
  });

  it('says when the list is empty', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderList(ctx, 'list-2');
    expect(
      await screen.findByText('Nothing in this list yet. Tap + to add something.'),
    ).toBeInTheDocument();
  });

  it('says when the list does not exist', async () => {
    const ctx = setup();
    renderList(ctx, 'does-not-exist');
    expect(await screen.findByText('List not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lists' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New habit' })).toBeNull();
  });

  it('starts new items in this list', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderList(ctx, 'list-2');
    await fireEvent.click(await screen.findByRole('button', { name: 'New habit' }));
    expect(screen.getByLabelText('List')).toHaveDisplayValue('💼 Work');
  });

  it('removes a deleted to-do from the page', async () => {
    const ctx = setup();
    await seedTodo(ctx, 'Clean garage');
    renderList(ctx);
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit Clean garage' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByText('Nothing in this list yet. Tap + to add something.'),
    ).toBeInTheDocument();
  });

  it('stops watching the clock when it goes away', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    const view = renderList(ctx);
    await screen.findByRole('heading', { level: 1, name: 'Personal' });
    view.unmount();
    expect(ctx.isStopped()).toBe(true);
  });

  it('shows names with HTML as plain text', async () => {
    const ctx = setup();
    await seedTodo(ctx, '<img src=x onerror=alert(1)>');
    const { container } = renderList(ctx);
    expect(await checkbox('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});
