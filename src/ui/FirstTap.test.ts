import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { SAVE_ERROR } from '../data/errors';
import { setupApp } from '../testing/app-fixture';
import ListPage from './ListPage.svelte';
import Today from './Today.svelte';

const setup = () => setupApp(undefined, 'first-tap');

describe('Tapping + before the starter lists have loaded', () => {
  it('still saves the new item into the first list', async () => {
    const ctx = setup();
    render(Today, { props: { listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock } });

    // The very first tap, before the first-run lists exist.
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.input(await screen.findByLabelText('Name'), { target: { value: 'Get stamps' } });
    expect(screen.getByLabelText('List')).toHaveValue('list-1');
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const stored = await ctx.db.items.toArray();
    expect(stored.map((item) => [item.title, item.listId])).toEqual([['Get stamps', 'list-1']]);
  });

  it('still reports a save that fails after the fast first tap', async () => {
    const ctx = setup();
    render(Today, { props: { listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock } });

    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.input(await screen.findByLabelText('Name'), { target: { value: 'Get stamps' } });
    ctx.db.close();
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it("keeps a list page's own list", async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    render(ListPage, {
      props: { listId: 'list-3', listsRepo: ctx.listsRepo, itemsRepo: ctx.itemsRepo, clock: ctx.clock },
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
    expect(await screen.findByLabelText('List')).toHaveValue('list-3');
  });
});
