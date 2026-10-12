import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { addDaysToKey } from '../domain/dates';
import { SAVE_ERROR } from '../data/errors';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import ItemPage from './ItemPage.svelte';
import Router from './Router.svelte';

const setup = (start?: Date) => setupApp(start, 'item-ui');
const range = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => addDaysToKey(from, i));

const renderPage = (ctx: AppCtx, itemId = 'item-1', backHref = '#/today') =>
  render(ItemPage, {
    props: { itemId, backHref, listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock },
  });

/** Starter lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function seedHabit(ctx: AppCtx, title = 'Meditate', days: string[] = []) {
  await ctx.listsRepo.ensureStarterLists();
  await ctx.itemsRepo.create({ title, listId: 'list-4', type: 'daily' });
  await ctx.db.completions.bulkAdd(
    days.map((dayKey, i) => ({ id: `c-${i}`, itemId: 'item-1', dayKey, createdAt: i })),
  );
}

async function seedGoal(ctx: AppCtx, logs: string[] = []) {
  await ctx.listsRepo.ensureStarterLists();
  await ctx.itemsRepo.create({ title: 'Peloton ride', listId: 'list-1', type: 'weekly', target: 3 });
  await ctx.db.completions.bulkAdd(
    logs.map((dayKey, i) => ({ id: `c-${i}`, itemId: 'item-1', dayKey, createdAt: i })),
  );
}

/** The value shown under a stat tile's label. */
const stat = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
const day = (name: string) => screen.findByRole('button', { name });
const storedDays = async (ctx: AppCtx) =>
  (await ctx.db.completions.toArray()).map((c) => c.dayKey).sort();

describe('stats', () => {
  it('shows a daily habit’s streaks, rates and total', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', [...range('2026-10-01', 5), ...range('2026-10-12', 3)]);
    renderPage(ctx);

    expect(await screen.findByRole('heading', { level: 1, name: 'Meditate' })).toBeInTheDocument();
    expect(stat('Current streak')).toBe('3 days');
    expect(stat('Best streak')).toBe('5 days');
    expect(stat('Last 30 days')).toBe('57%');
    expect(stat('All time')).toBe('57%');
    expect(stat('Total')).toBe('8');
  });

  it('shows dashes, not 0%, for a habit never done', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Stretch');
    renderPage(ctx);
    await screen.findByRole('heading', { level: 1, name: 'Stretch' });

    expect(stat('Current streak')).toBe('0 days');
    expect(stat('Best streak')).toBe('0 days');
    expect(stat('Last 30 days')).toBe('—');
    expect(stat('Total')).toBe('0');
  });

  it('shows a weekly goal’s weeks in a row and 12-week rate', async () => {
    const ctx = setup(new Date(2026, 8, 13, 9, 0)); // the goal is created on Sunday 2026-09-13
    await seedGoal(ctx, [
      ...range('2026-09-13', 3),
      ...range('2026-09-20', 3),
      '2026-09-27',
      ...range('2026-10-04', 3),
      '2026-10-12',
    ]);
    ctx.setNow(new Date(2026, 9, 14, 9, 0));
    renderPage(ctx);
    await screen.findByRole('heading', { level: 1, name: 'Peloton ride' });

    expect(stat('Current streak')).toBe('1 week');
    expect(stat('Best streak')).toBe('2 weeks');
    expect(stat('Last 12 weeks')).toBe('75%');
    expect(stat('Total')).toBe('11');
  });
});

describe('calendar backfill', () => {
  it('shows this month, Sunday first, with done days pressed', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', ['2026-10-12', '2026-10-13']);
    renderPage(ctx);

    expect(await screen.findByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument();
    expect(await day('October 12, done')).toHaveAttribute('aria-pressed', 'true');
    expect(await day('October 11, not done')).toHaveAttribute('aria-pressed', 'false');
    const grid = screen.getByRole('heading', { level: 2 }).closest('section')!;
    const firstDay = within(grid).getByRole('button', { name: 'October 1, not done' });
    // October 2026 starts on a Thursday: 7 weekday letters and 4 blanks come first.
    expect(firstDay.parentElement!.children[11]).toBe(firstDay);
  });

  it('fixes a missed day, updating the streak and storage', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', ['2026-10-12', '2026-10-14']);
    renderPage(ctx);

    await fireEvent.click(await day('October 13, not done'));

    expect(await day('October 13, done')).toHaveAttribute('aria-pressed', 'true');
    expect(stat('Current streak')).toBe('3 days');
    await waitFor(async () =>
      expect(await storedDays(ctx)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']),
    );
  });

  it('un-marks a done day', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', ['2026-10-13']);
    renderPage(ctx);
    await fireEvent.click(await day('October 13, done'));
    expect(await day('October 13, not done')).toBeInTheDocument();
    await waitFor(async () => expect(await storedDays(ctx)).toEqual([]));
  });

  it('goes back a month to fix older days, but never past this month', async () => {
    const ctx = setup();
    await seedHabit(ctx);
    renderPage(ctx);
    const next = await screen.findByRole('button', { name: 'Next month' });
    expect(next).toBeDisabled();
    expect(await day('October 15')).toBeDisabled();

    await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { level: 2, name: 'September 2026' })).toBeInTheDocument();
    expect(next).toBeEnabled();
    await fireEvent.click(await day('September 30, not done'));
    await waitFor(async () => expect(await storedDays(ctx)).toEqual(['2026-09-30']));

    await fireEvent.click(next);
    expect(screen.getByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument();
  });

  it('adds or removes one weekly log per tap', async () => {
    const ctx = setup();
    await seedGoal(ctx, ['2026-10-13', '2026-10-13']);
    renderPage(ctx);

    await fireEvent.click(await day('October 12, 0 logs'));
    expect(await day('October 12, 1 log')).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(await day('October 13, 2 logs'));
    expect(await day('October 13, 1 log')).toBeInTheDocument();
    await fireEvent.click(await day('October 12, 1 log'));
    expect(await day('October 12, 0 logs')).toHaveAttribute('aria-pressed', 'false');
    await waitFor(async () => expect(await storedDays(ctx)).toEqual(['2026-10-13']));
  });

  it('puts a day back and says so when saving fails', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', ['2026-10-12']);
    renderPage(ctx);
    const button = await day('October 13, not done');
    ctx.db.close();

    await fireEvent.click(button);

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    expect(await day('October 13, not done')).toHaveAttribute('aria-pressed', 'false');
  });

  it('unlocks the next day at midnight', async () => {
    const ctx = setup(new Date(2026, 9, 14, 23, 59, 50));
    await seedHabit(ctx, 'Meditate', ['2026-10-13', '2026-10-14']);
    renderPage(ctx);
    expect(await day('October 15')).toBeDisabled();

    ctx.rollTo(new Date(2026, 9, 15, 0, 0, 5));

    expect(await day('October 15, not done')).toBeEnabled();
    expect(stat('Current streak')).toBe('2 days');
  });
});

describe('heatmap', () => {
  it('is one labelled image of 26 weeks ending this week, with future days blank', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', [...range('2026-10-01', 5), ...range('2026-10-12', 3)]);
    renderPage(ctx);

    const heatmap = await screen.findByRole('img', { name: 'Last 6 months: 8 of 179 days done' });
    const weeks = [...heatmap.querySelectorAll('.week')];
    expect(weeks).toHaveLength(26);
    const lastWeek = [...weeks.at(-1)!.querySelectorAll('.cell')];
    expect(lastWeek.map((cell) => cell.getAttribute('data-day'))).toEqual(range('2026-10-11', 7));
    expect(lastWeek.slice(4).every((cell) => cell.classList.contains('future'))).toBe(true);
    expect(heatmap.querySelector('[data-day="2026-10-12"]')).toHaveAttribute('data-level', '3');
    expect(heatmap.querySelector('[data-day="2026-10-11"]')).toHaveAttribute('data-level', '0');
  });

  it('shades a weekly goal by logs per day', async () => {
    const ctx = setup();
    await seedGoal(ctx, ['2026-10-12', '2026-10-13', '2026-10-13']);
    renderPage(ctx);

    const heatmap = await screen.findByRole('img', { name: 'Last 6 months: 3 logs' });
    expect(heatmap.querySelector('[data-day="2026-10-12"]')).toHaveAttribute('data-level', '1');
    expect(heatmap.querySelector('[data-day="2026-10-13"]')).toHaveAttribute('data-level', '2');
  });
});

describe('editing from the page', () => {
  it('renames from Edit and shows the new name', async () => {
    const ctx = setup();
    await seedHabit(ctx);
    renderPage(ctx);
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit habit' })).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Meditate 10 min' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Meditate 10 min' }),
    ).toBeInTheDocument();
  });

  it('goes back after a delete', async () => {
    const ctx = setup();
    await seedHabit(ctx);
    location.hash = '#/item/item-1';
    renderPage(ctx, 'item-1', '#/list/list-4');
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(location.hash).toBe('#/list/list-4'));
    expect((await ctx.db.items.get('item-1'))?.archivedAt).toBeDefined();
  });
});

describe('changing type from the page', () => {
  const openEdit = async () => fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  const chooseType = (name: string) =>
    fireEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('radio', { name }));
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  it('shows the Type switch with the current type selected', async () => {
    const ctx = setup();
    await seedHabit(ctx);
    renderPage(ctx);
    await openEdit();
    expect(screen.getByRole('radio', { name: 'Daily habit' })).toBeChecked();
  });

  it('turns a daily habit into a weekly goal without asking, keeping its check-ins', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Gym', ['2026-10-11', '2026-10-12', '2026-10-13']);
    renderPage(ctx);
    await openEdit();
    await chooseType('Weekly goal');
    expect(screen.getByLabelText('Times per week')).toHaveValue('3');
    await save();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('img', { name: 'Last 6 months: 3 logs' })).toBeInTheDocument();
    expect(stat('Current streak')).toBe('1 week');
    expect((await ctx.db.items.get('item-1'))?.type).toBe('weekly');
  });

  it('asks before turning a habit into a to-do, and Cancel changes nothing', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Fix bike', ['2026-10-12']);
    renderPage(ctx);
    await openEdit();
    await chooseType('To-do');
    await save();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Change “Fix bike” to a to-do? Its check-ins are kept and come back if you change it back.',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('radio', { name: 'To-do' })).toBeChecked();
    expect((await ctx.db.items.get('item-1'))?.type).toBe('daily');
  });

  it('goes back once a habit becomes a to-do, keeping its check-ins', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Fix bike', ['2026-10-12']);
    location.hash = '#/item/item-1';
    renderPage(ctx, 'item-1', '#/today');
    await openEdit();
    await chooseType('To-do');
    await save();
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));

    await waitFor(() => expect(location.hash).toBe('#/today'));
    expect((await ctx.db.items.get('item-1'))?.type).toBe('todo');
    expect(await storedDays(ctx)).toEqual(['2026-10-12']);
  });

  it('keeps the confirmation open with the error when the change cannot be saved', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Fix bike');
    renderPage(ctx);
    await openEdit();
    await chooseType('To-do');
    await save();
    ctx.db.close();
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('shows names as plain text in the question', async () => {
    const ctx = setup();
    await seedHabit(ctx, '<b>Gym</b>');
    const { container } = renderPage(ctx);
    await openEdit();
    await chooseType('To-do');
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Change “<b>Gym</b>” to a to-do?');
    expect(container.ownerDocument.querySelectorAll('b')).toHaveLength(0);
  });
});

describe('missing items and safety', () => {
  it.each(['does-not-exist', '<img src=x>'])('says when %j does not exist', async (id) => {
    const ctx = setup();
    const { container } = renderPage(ctx, id);
    expect(await screen.findByText('This habit no longer exists')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '#/today');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('has no page for a to-do', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Clean garage', listId: 'list-4', type: 'todo' });
    renderPage(ctx);
    expect(await screen.findByText('This habit no longer exists')).toBeInTheDocument();
  });

  it('shows a name with HTML as plain text', async () => {
    const ctx = setup();
    await seedHabit(ctx, '<img src=x onerror=alert(1)>');
    const { container } = renderPage(ctx);
    expect(
      await screen.findByRole('heading', { level: 1, name: '<img src=x onerror=alert(1)>' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('stops watching the clock when it goes away', async () => {
    const ctx = setup();
    await seedHabit(ctx);
    const view = renderPage(ctx);
    await screen.findByRole('heading', { level: 1, name: 'Meditate' });
    view.unmount();
    expect(ctx.isStopped()).toBe(true);
  });
});

describe('navigation', () => {
  const renderApp = (ctx: AppCtx, hash: string) => {
    location.hash = hash;
    return render(Router, { props: routerProps(ctx) });
  };

  it('opens from a list page and goes back to it, with Lists highlighted', async () => {
    const ctx = setup();
    await seedHabit(ctx);
    renderApp(ctx, '#/list/list-4');

    await fireEvent.click(await screen.findByRole('link', { name: 'Meditate details' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Meditate' })).toBeInTheDocument();
    expect(location.hash).toBe('#/item/item-1');
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect(within(tabs).getByRole('link', { name: 'Lists' })).toHaveAttribute('aria-current', 'page');

    await fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Personal' })).toBeInTheDocument();
  });

  it('goes back to Today when opened directly', async () => {
    const ctx = setup();
    await seedHabit(ctx);
    renderApp(ctx, '#/item/item-1');
    expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute('href', '#/today');
  });

  it('shows a backfill on Today after going back', async () => {
    const ctx = setup();
    await seedHabit(ctx, 'Meditate', ['2026-10-12', '2026-10-14']);
    renderApp(ctx, '#/today');

    await fireEvent.click(await screen.findByRole('link', { name: 'Meditate details' }));
    await fireEvent.click(await day('October 13, not done'));
    await day('October 13, done');
    await fireEvent.click(screen.getByRole('link', { name: 'Back' }));

    expect(await screen.findByRole('img', { name: '3 day streak' })).toBeInTheDocument();
  });

  it('switches between the other screens', async () => {
    const ctx = setup();
    renderApp(ctx, '#');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    location.hash = '#/lists';
    expect(await screen.findByRole('heading', { level: 1, name: 'Lists' })).toBeInTheDocument();
  });
});
