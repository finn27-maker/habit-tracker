import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { SAVE_ERROR } from '../data/errors';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';
import UpcomingPage from './UpcomingPage.svelte';

/** Short enough to keep tests quick, long enough to tap again before it ends. */
const LINGER = 40;

// Sunday 2026-11-01, 09:00.
const setup = () => setupApp(new Date(2026, 10, 1, 9, 0), 'upcoming-ui');

const renderPage = (ctx: AppCtx, lingerMs = LINGER) =>
  render(UpcomingPage, {
    props: { listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock, lingerMs },
  });

/** Fixture lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function seed(ctx: AppCtx, title: string, listId: string, extra: { dueDate?: string; note?: string } = {}) {
  await ctx.listsRepo.ensureStarterLists();
  const made = await ctx.itemsRepo.create({ title, type: 'todo', listId, ...extra });
  if (!made.ok) throw new Error(made.error);
  return made.value.id;
}

const sectionTitles = () =>
  screen.getAllByRole('region').map((region) => within(region).getByRole('heading').textContent);
const namesIn = (title: string) =>
  within(screen.getByRole('region', { name: title }))
    .getAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label'));

describe('Upcoming tab', () => {
  it('sits after Today in the tab bar and is marked as the current page', async () => {
    const ctx = setup();
    location.hash = '#/upcoming';
    render(Router, { props: routerProps(ctx) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Upcoming' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(tabs.map((tab) => tab.textContent?.trim().split(/\s+/).pop())).toEqual([
      'Today',
      'Upcoming',
      'History',
      'Lists',
    ]);
    expect(tabs[1]).toHaveAttribute('href', '#/upcoming');
    expect(tabs[1]).toHaveAttribute('aria-current', 'page');
    expect(tabs[0]).not.toHaveAttribute('aria-current');
  });

  it('groups open to-dos from every list by date', async () => {
    const ctx = setup();
    await seed(ctx, 'Renew licence', 'list-2', { dueDate: '2026-10-29' });
    await seed(ctx, 'Pay the plumber', 'list-4', { dueDate: '2026-11-01' });
    await seed(ctx, 'Book physio', 'list-1', { dueDate: '2026-11-02' });
    await seed(ctx, 'Send report', 'list-2', { dueDate: '2026-11-05' });
    await seed(ctx, 'Plan holiday', 'list-4', { dueDate: '2026-11-20' });
    await seed(ctx, 'Buy light bulbs', 'list-4');
    renderPage(ctx);

    await screen.findByRole('checkbox', { name: 'Buy light bulbs' });
    expect(sectionTitles()).toEqual(['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date']);
    expect(namesIn('Overdue')).toEqual(['Renew licence']);
    expect(namesIn('Tomorrow')).toEqual(['Book physio']);
    expect(namesIn('No date')).toEqual(['Buy light bulbs']);
  });

  it("shows each row's list, due label and note, read with the name", async () => {
    const ctx = setup();
    await seed(ctx, 'Send report', 'list-2', { dueDate: '2026-11-05', note: 'Q3 numbers' });
    renderPage(ctx);

    const edit = await screen.findByRole('button', { name: 'Edit Send report' });
    expect(edit).toHaveAccessibleDescription('Q3 numbers 💼 Work');
    const row = edit.closest('li') as HTMLElement;
    expect(row).toHaveTextContent('💼 Work');
    expect(row).toHaveTextContent('Thu');
  });

  it('leaves out habits, goals and finished to-dos, and says when nothing is open', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Stretch', type: 'daily', listId: 'list-1' });
    await ctx.itemsRepo.create({ title: 'Peloton ride', type: 'weekly', listId: 'list-1', target: 3 });
    const old = await seed(ctx, 'Old task', 'list-4');
    await ctx.itemsRepo.setTodoDone(old, true);
    renderPage(ctx);

    expect(await screen.findByText('Nothing coming up. Tap + to add a to-do.')).toBeInTheDocument();
    expect(screen.queryByText('Stretch')).toBeNull();
    expect(screen.queryByText('Peloton ride')).toBeNull();
    expect(screen.queryByText('Old task')).toBeNull();
  });

  it('ticks a to-do off: it lingers checked, then leaves', async () => {
    const ctx = setup();
    const id = await seed(ctx, 'Book physio', 'list-1', { dueDate: '2026-11-02' });
    renderPage(ctx);

    await fireEvent.click(await screen.findByRole('checkbox', { name: 'Book physio' }));
    expect(screen.getByRole('checkbox', { name: 'Book physio' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Book physio' })).toBeNull());
    expect((await ctx.db.items.get(id))?.completedAt).toBeDefined();
  });

  it('a second tap during the linger keeps it open', async () => {
    const ctx = setup();
    const id = await seed(ctx, 'Book physio', 'list-1', { dueDate: '2026-11-02' });
    renderPage(ctx, 200);

    const box = await screen.findByRole('checkbox', { name: 'Book physio' });
    await fireEvent.click(box);
    await fireEvent.click(box);
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(screen.getByRole('checkbox', { name: 'Book physio' })).toHaveAttribute('aria-checked', 'false');
    await waitFor(async () => expect((await ctx.db.items.get(id))?.completedAt).toBeUndefined());
  });

  it('reverts a tick that could not be saved and says so', async () => {
    const ctx = setup();
    await seed(ctx, 'Book physio', 'list-1', { dueDate: '2026-11-02' });
    renderPage(ctx);
    const box = await screen.findByRole('checkbox', { name: 'Book physio' });
    ctx.db.close();

    await fireEvent.click(box);

    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'false'));
  });

  it('editing the due date moves the row to its new section', async () => {
    const ctx = setup();
    await seed(ctx, 'Plan holiday', 'list-4', { dueDate: '2026-11-20' });
    renderPage(ctx);

    await fireEvent.click(await screen.findByRole('button', { name: 'Edit Plan holiday' }));
    await fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2026-11-02' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(namesIn('Tomorrow')).toEqual(['Plan holiday']));
    expect(screen.queryByRole('region', { name: 'Later' })).toBeNull();
  });

  it('moves rows on at midnight', async () => {
    const ctx = setup();
    await seed(ctx, 'Book physio', 'list-1', { dueDate: '2026-11-02' });
    renderPage(ctx);
    await screen.findByRole('checkbox', { name: 'Book physio' });
    expect(namesIn('Tomorrow')).toEqual(['Book physio']);

    ctx.rollTo(new Date(2026, 10, 2, 0, 0, 5));

    await waitFor(() => expect(namesIn('Today')).toEqual(['Book physio']));
  });

  it('hides to-dos in a deleted list', async () => {
    const ctx = setup();
    await seed(ctx, 'Send report', 'list-2');
    await seed(ctx, 'Call vet', 'list-4');
    await ctx.listsRepo.remove('list-2');
    renderPage(ctx);

    await screen.findByRole('checkbox', { name: 'Call vet' });
    expect(screen.queryByText('Send report')).toBeNull();
  });

  it('shows list names as plain text', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.listsRepo.update('list-4', { name: '<img src=x onerror=alert(1)>', emoji: '🏠', color: 'green' });
    await seed(ctx, 'Call vet', 'list-4');
    const { container } = renderPage(ctx);

    expect(await screen.findByText('🏠 <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
