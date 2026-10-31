import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

function renderAt(ctx: AppCtx, hash: string) {
  location.hash = hash;
  return render(Router, { props: routerProps(ctx) });
}

/** "Read" added on Oct 27, skipped Oct 28, done Oct 29; viewed on Oct 30 before checking it. */
async function readHabit() {
  const ctx = setupApp(new Date(2026, 9, 27, 9, 0), 'fair-rates-ui');
  await ctx.listsRepo.ensureStarterLists();
  const made = await ctx.itemsRepo.create({ title: 'Read', listId: 'list-1', type: 'daily' });
  if (!made.ok) throw new Error(made.error);
  ctx.setNow(new Date(2026, 9, 29, 9));
  await ctx.itemsRepo.toggleDay(made.value.id, '2026-10-29');
  ctx.setNow(new Date(2026, 9, 30, 9));
  return { ctx, id: made.value.id };
}

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('rates from the day a habit was added', () => {
  it('count the skipped day on the History tab', async () => {
    const { ctx } = await readHabit();
    renderAt(ctx, '#/history');
    expect(await screen.findByRole('link', { name: /^Read/ })).toHaveTextContent(
      '1 day now · Best 1 day · Last 30 days 50%',
    );
  });

  it('match on the habit page', async () => {
    const { ctx, id } = await readHabit();
    renderAt(ctx, `#/item/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'Read' });
    expect(stat('Last 30 days')).toBe('50%');
    expect(stat('All time')).toBe('50%');
  });
});
