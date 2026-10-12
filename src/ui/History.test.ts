import { render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { ITEMS_LOAD_ERROR } from '../data/items-repo';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

const setup = () => setupApp(new Date(2026, 9, 14, 9, 0), 'history-ui');

function renderAt(ctx: AppCtx, hash: string, overrides: Partial<ReturnType<typeof routerProps>> = {}) {
  location.hash = hash;
  return render(Router, { props: { ...routerProps(ctx), ...overrides } });
}

/** Fixture lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function seed(ctx: AppCtx) {
  await ctx.listsRepo.ensureStarterLists();
  const add = async (title: string, type: string, listId: string) => {
    const made = await ctx.itemsRepo.create({ title, type, listId, target: 3 });
    if (!made.ok) throw new Error(made.error);
    return made.value.id;
  };
  const inbox = await add('Inbox zero', 'daily', 'list-2');
  const stretch = await add('Stretch', 'daily', 'list-1');
  const run = await add('Run', 'weekly', 'list-1');
  await add('Call mom', 'todo', 'list-1');
  const old = await add('Old habit', 'daily', 'list-1');
  for (const day of ['2026-10-12', '2026-10-13']) await ctx.itemsRepo.toggleDay(stretch, day);
  await ctx.itemsRepo.addCompletion(run, '2026-10-13');
  await ctx.itemsRepo.addCompletion(run, '2026-10-13');
  await ctx.itemsRepo.toggleDay(old, '2026-10-13');
  await ctx.itemsRepo.archive(old);
  return { inbox, stretch, run };
}

describe('History tab', () => {
  it('shows a combined heatmap, then each habit and goal in list order', async () => {
    const ctx = setup();
    await seed(ctx);
    renderAt(ctx, '#/history');

    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
    const heatmap = await screen.findByRole('img', {
      name: 'Last 6 months: 4 check-ins across 3 habits and goals',
    });
    expect(heatmap.querySelector('[data-day="2026-10-12"]')).toHaveAttribute('data-level', '1');
    expect(heatmap.querySelector('[data-day="2026-10-13"]')).toHaveAttribute('data-level', '3');

    const rows = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('#/item/'));
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      // Rates count from the first check-in, as on each item's own page.
      'Stretch 🏋️ Fitness 2 days now · Best 2 days · Last 30 days 100%',
      'Run 🏋️ Fitness 0 weeks now · Best 0 weeks · Last 12 weeks —',
      'Inbox zero 💼 Work 0 days now · Best 0 days · Last 30 days —',
    ]);
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect(within(tabs).getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
  });

  it('links each row to its page', async () => {
    const ctx = setup();
    const { stretch } = await seed(ctx);
    renderAt(ctx, '#/history');
    expect(await screen.findByRole('link', { name: /^Stretch/ })).toHaveAttribute('href', `#/item/${stretch}`);
  });

  it('leaves out to-dos and deleted habits', async () => {
    const ctx = setup();
    await seed(ctx);
    renderAt(ctx, '#/history');
    await screen.findByRole('link', { name: /^Stretch/ });
    expect(screen.queryByText('Call mom')).toBeNull();
    expect(screen.queryByText('Old habit')).toBeNull();
  });

  it('says what to do when there is nothing to show', async () => {
    const ctx = setup();
    renderAt(ctx, '#/history');
    expect(
      await screen.findByText('No habits or weekly goals yet. Add one with + on Today.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('reports when habits cannot be loaded', async () => {
    const ctx = setup();
    const broken = { ...ctx.itemsRepo, listActive: async () => ({ ok: false as const, error: ITEMS_LOAD_ERROR }) };
    renderAt(ctx, '#/history', { itemsRepo: broken });
    expect(await screen.findByText(ITEMS_LOAD_ERROR)).toBeInTheDocument();
  });

  it('shows names as plain text', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: '<script>alert(1)</script>', listId: 'list-1', type: 'daily' });
    const { container } = renderAt(ctx, '#/history');
    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });

  it('moves the heatmap to the new day at midnight', async () => {
    const ctx = setup();
    await seed(ctx);
    renderAt(ctx, '#/history');
    const heatmap = await screen.findByRole('img');
    expect(heatmap.querySelector('[data-day="2026-10-15"]')).toHaveClass('future');
    ctx.rollTo(new Date(2026, 9, 15, 0, 0, 5));
    await waitFor(() =>
      expect(screen.getByRole('img').querySelector('[data-day="2026-10-15"]')).not.toHaveClass('future'),
    );
  });
});
