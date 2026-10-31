import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { NOTE_TOO_LONG } from '../domain/items';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

const setup = () => setupApp(new Date(2026, 9, 31, 9, 0), 'habit-notes-ui');

function renderAt(ctx: AppCtx, hash: string) {
  location.hash = hash;
  return render(Router, { props: routerProps(ctx) });
}

/** Fixture lists are list-1 Fitness … list-4 Personal. */
async function add(ctx: AppCtx, title: string, type: 'daily' | 'weekly' | 'todo', note?: string) {
  await ctx.listsRepo.ensureStarterLists();
  const made = await ctx.itemsRepo.create({ title, listId: 'list-1', type, target: 3, note });
  if (!made.ok) throw new Error(made.error);
  return made.value.id;
}

const notesField = () => screen.getByLabelText('Notes');

describe('notes on habits and goals', () => {
  it('show under the name on Today, describing the link without renaming it', async () => {
    const ctx = setup();
    await add(ctx, 'Meditate', 'daily', '20 minutes, before breakfast');
    await add(ctx, 'Peloton ride', 'weekly', '45-minute class');
    await add(ctx, 'Stretch', 'daily');
    renderAt(ctx, '#/today');

    const meditate = await screen.findByRole('link', { name: 'Meditate details' });
    expect(within(meditate).getByText('20 minutes, before breakfast')).toBeInTheDocument();
    expect(meditate).toHaveAccessibleDescription('20 minutes, before breakfast');
    expect(screen.getByRole('checkbox', { name: 'Meditate' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Peloton ride details' })).toHaveAccessibleDescription('45-minute class');
    const stretch = screen.getByRole('link', { name: 'Stretch details' });
    expect(stretch.querySelector('.note')).toBeNull();
    expect(stretch).not.toHaveAttribute('aria-describedby');
  });

  it('show on the list page and under the title on the item page', async () => {
    const ctx = setup();
    const id = await add(ctx, 'Peloton ride', 'weekly', '45-minute class');
    const list = renderAt(ctx, '#/list/list-1');
    expect(await screen.findByText('45-minute class')).toBeInTheDocument();
    list.unmount();
    renderAt(ctx, `#/item/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'Peloton ride' });
    expect(screen.getByText('45-minute class')).toBeInTheDocument();
  });

  it('can be added with a new habit, changed and cleared from its page', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderAt(ctx, '#/today');
    await screen.findByText(/Nothing here yet/);
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Daily habit' }));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Meditate' } });
    await fireEvent.input(notesField(), { target: { value: '20 minutes' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('20 minutes')).toBeInTheDocument();

    const [stored] = await ctx.db.items.toArray();
    location.hash = `#/item/${stored!.id}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(notesField()).toHaveValue('20 minutes');
    await fireEvent.input(notesField(), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect('note' in (await ctx.db.items.get(stored!.id))!).toBe(false));
  });

  it('keeps the note when a habit becomes a weekly goal', async () => {
    const ctx = setup();
    const id = await add(ctx, 'Gym', 'daily', 'legs and back');
    await ctx.itemsRepo.update(id, { title: 'Gym', listId: 'list-1', type: 'weekly', target: 3 });
    expect((await ctx.db.items.get(id))?.note).toBe('legs and back');
  });

  it('refuses a habit note over the limit', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    expect(
      await ctx.itemsRepo.create({ title: 'Meditate', listId: 'list-1', type: 'daily', note: 'x'.repeat(201) }),
    ).toEqual({ ok: false, error: NOTE_TOO_LONG });
  });

  it('shows habit notes as plain text', async () => {
    const ctx = setup();
    const id = await add(ctx, 'Odd', 'daily', '<img src=x onerror=alert(1)>');
    const today = renderAt(ctx, '#/today');
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(today.container.querySelectorAll('img')).toHaveLength(0);
    today.unmount();
    const page = renderAt(ctx, `#/item/${id}`);
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(page.container.querySelectorAll('img')).toHaveLength(0);
  });
});
