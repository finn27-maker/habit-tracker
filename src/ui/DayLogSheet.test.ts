import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { SAVE_ERROR } from '../data/errors';
import { setupApp, type AppCtx } from '../testing/app-fixture';
import ItemPage from './ItemPage.svelte';

// Wednesday 2026-10-14, 09:00.
const setup = () => setupApp(undefined, 'day-log-sheet');

const renderPage = (ctx: AppCtx) =>
  render(ItemPage, {
    props: { itemId: 'item-1', backHref: '#/today', listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock },
  });

/** Starter lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function seedGoal(ctx: AppCtx, logs: string[] = [], title = 'Peloton ride') {
  await ctx.listsRepo.ensureStarterLists();
  await ctx.itemsRepo.create({ title, listId: 'list-1', type: 'weekly', target: 3 });
  await ctx.db.completions.bulkAdd(
    logs.map((dayKey, i) => ({ id: `c-${i}`, itemId: 'item-1', dayKey, createdAt: i })),
  );
}

const day = (name: string) => screen.findByRole('button', { name });
const sheet = () => screen.getByRole('dialog');
const storedOn = async (ctx: AppCtx, dayKey: string) =>
  (await ctx.db.completions.toArray()).filter((c) => c.dayKey === dayKey).length;

async function openSheet(name: string) {
  await fireEvent.click(await day(name));
  return screen.findByRole('dialog');
}

describe('the day sheet for a weekly goal', () => {
  it('opens on a past day with the date, goal name and count', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderPage(ctx);

    expect(await day('October 12, 0 logs')).toHaveAttribute('aria-haspopup', 'dialog');
    expect(await day('October 12, 0 logs')).not.toHaveAttribute('aria-pressed');
    const dialog = await openSheet('October 12, 0 logs');
    expect(dialog).toHaveAccessibleName('Monday, October 12');
    expect(within(dialog).getByText('Peloton ride')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('0 logs');
    expect(within(dialog).getByRole('button', { name: 'Remove a log' })).toBeDisabled();
  });

  it('records two rides on one past day and Done shows ×2', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderPage(ctx);

    const dialog = await openSheet('October 12, 0 logs');
    const add = within(dialog).getByRole('button', { name: 'Add a log' });
    await fireEvent.click(add);
    expect(within(dialog).getByRole('status')).toHaveTextContent('1 log');
    await fireEvent.click(add);
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 logs');
    await waitFor(async () => expect(await storedOn(ctx, '2026-10-12')).toBe(2));

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const button = await day('October 12, 2 logs');
    expect(button).toHaveTextContent('×2');
  });

  it('removes one log at a time', async () => {
    const ctx = setup();
    await seedGoal(ctx, ['2026-10-12', '2026-10-12', '2026-10-12']);
    renderPage(ctx);

    const dialog = await openSheet('October 12, 3 logs');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove a log' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 logs');
    await waitFor(async () => expect(await storedOn(ctx, '2026-10-12')).toBe(2));
  });

  it('opens for today too', async () => {
    const ctx = setup();
    await seedGoal(ctx, ['2026-10-14']);
    renderPage(ctx);

    const dialog = await openSheet('October 14, 1 log');
    expect(dialog).toHaveAccessibleName('Wednesday, October 14');
  });

  it('stops + at 14 logs on one day', async () => {
    const ctx = setup();
    await seedGoal(ctx, Array.from({ length: 13 }, () => '2026-10-12'));
    renderPage(ctx);

    const dialog = await openSheet('October 12, 13 logs');
    const add = within(dialog).getByRole('button', { name: 'Add a log' });
    await fireEvent.click(add);
    expect(within(dialog).getByRole('status')).toHaveTextContent('14 logs');
    expect(add).toBeDisabled();
    await waitFor(async () => expect(await storedOn(ctx, '2026-10-12')).toBe(14));
  });

  it('counts a past week, not this week', async () => {
    const ctx = setup();
    await seedGoal(ctx, ['2026-10-05', '2026-10-06', '2026-10-13']);
    renderPage(ctx);

    const dialog = await openSheet('October 9, 0 logs');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add a log' }));
    await waitFor(async () => expect(await storedOn(ctx, '2026-10-09')).toBe(1));
    // This week still has the one log on the 13th.
    expect((await ctx.db.completions.toArray()).filter((c) => c.dayKey >= '2026-10-11')).toHaveLength(1);
  });

  it('puts the count back and says so when a change cannot be saved', async () => {
    const ctx = setup();
    await seedGoal(ctx);
    renderPage(ctx);

    const dialog = await openSheet('October 12, 0 logs');
    ctx.db.close();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add a log' }));

    await waitFor(() => expect(screen.getByText(SAVE_ERROR)).toBeInTheDocument());
    expect(within(sheet()).getByRole('status')).toHaveTextContent('0 logs');
  });

  it('shows the goal name as plain text', async () => {
    const ctx = setup();
    await seedGoal(ctx, [], '<img src=x onerror=alert(1)>');
    const { container } = renderPage(ctx);

    const dialog = await openSheet('October 12, 0 logs');
    expect(within(dialog).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('img')).toBeNull();
  });
});

describe('daily habits on the calendar', () => {
  it('still toggle with one tap and open no sheet', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Stretch', listId: 'list-1', type: 'daily' });
    renderPage(ctx);

    await fireEvent.click(await day('October 12, not done'));
    expect(await day('October 12, done')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
