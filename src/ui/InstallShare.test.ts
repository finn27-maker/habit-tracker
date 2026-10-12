import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import {
  APP_URL,
  installHintFor,
  routerProps,
  setupApp,
  type AppCtx,
} from '../testing/app-fixture';
import Router from './Router.svelte';

const setup = () => setupApp(new Date(2026, 9, 14, 9, 0), 'install-share-ui');
const card = () => screen.queryByRole('region', { name: 'Install this app' });

function renderAt(ctx: AppCtx, hash: string, overrides: Partial<ReturnType<typeof routerProps>> = {}) {
  location.hash = hash;
  return render(Router, { props: { ...routerProps(ctx), ...overrides } });
}

describe('install card placement', () => {
  it('shows on Today in a browser tab, above the backup reminder', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Stretch', listId: 'list-1', type: 'daily' });
    renderAt(ctx, '#/today', { installHint: installHintFor().hint });

    const reminder = await screen.findByRole('complementary', { name: 'Backup reminder' });
    expect(card()).not.toBeNull();
    expect(card()!.compareDocumentPosition(reminder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['#/lists', 'Lists'],
    ['#/list/list-1', 'Fitness'],
    ['#/item/item-1', 'Stretch'],
    ['#/deleted', 'Recently deleted'],
  ])('is not shown on %s', async (hash, heading) => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Stretch', listId: 'list-1', type: 'daily' });
    renderAt(ctx, hash, { installHint: installHintFor().hint });
    await screen.findByRole('heading', { level: 1, name: heading });
    expect(card()).toBeNull();
  });
});

describe('Share this app', () => {
  async function openLists(ctx: AppCtx) {
    await ctx.listsRepo.ensureStarterLists();
    renderAt(ctx, '#/lists');
    return screen.findByRole('button', { name: 'Share this app' });
  }
  const shareStatus = () =>
    screen.getByRole('region', { name: 'Share this app' }).querySelector('[role="status"]')!;

  it('sits after the lists and before Backup', async () => {
    const ctx = setup();
    const button = await openLists(ctx);
    await screen.findByText('Fitness');
    const backup = screen.getByRole('heading', { name: 'Backup' });
    const lastList = screen.getByText('Personal');
    expect(lastList.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(backup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shares only the message and the link, whatever the lists hold', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Secret plan', listId: 'list-3', type: 'todo' });
    await fireEvent.click(await openLists(ctx));
    await waitFor(() => expect(ctx.sharedTexts).toHaveLength(1));
    expect(ctx.sharedTexts[0]).toEqual({
      title: 'Habit Tracker',
      text: `Try this habit and to-do tracker: ${APP_URL}`,
    });
    expect(shareStatus()).toHaveTextContent('');
    expect(ctx.copied).toEqual([]);
  });

  it('copies the link and says so where there is no share sheet', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderAt(ctx, '#/lists', { share: { ...ctx.share, share: undefined } });
    await fireEvent.click(await screen.findByRole('button', { name: 'Share this app' }));
    await waitFor(() => expect(shareStatus()).toHaveTextContent('Link copied'));
    expect(ctx.copied).toEqual([APP_URL]);
  });

  it('shows the link when it cannot be copied', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderAt(ctx, '#/lists', { share: { download: () => {} } });
    await fireEvent.click(await screen.findByRole('button', { name: 'Share this app' }));
    await waitFor(() => expect(shareStatus()).toHaveTextContent(`Copy this link: ${APP_URL}`));
  });

  it('clears the message when the share sheet is closed', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    let calls = 0;
    const share = {
      ...ctx.share,
      share: async () => {
        calls++;
        if (calls === 1) throw new DOMException('no', 'NotAllowedError');
        throw new DOMException('closed', 'AbortError');
      },
    };
    renderAt(ctx, '#/lists', { share });
    const button = await screen.findByRole('button', { name: 'Share this app' });
    await fireEvent.click(button);
    await waitFor(() => expect(shareStatus()).toHaveTextContent('Link copied'));
    await fireEvent.click(button);
    await waitFor(() => expect(shareStatus()).toHaveTextContent(''));
    expect(ctx.copied).toEqual([APP_URL]);
  });
});
