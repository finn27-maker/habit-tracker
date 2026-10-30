import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { installHintFor, routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';
const setup = () => setupApp(new Date(2026, 9, 30, 9, 0), 'notice-ui');
const card = () => screen.queryByRole('region', { name: 'New from your assistant' });

function renderAt(ctx: AppCtx, hash: string, overrides: Partial<ReturnType<typeof routerProps>> = {}) {
  location.hash = hash;
  return render(Router, { props: { ...routerProps(ctx), ...overrides } });
}

async function arrive(ctx: AppCtx, ...titles: string[]) {
  await ctx.listsRepo.ensureStarterLists();
  await ctx.assistantRepo.pair(CODE);
  await ctx.assistantRepo.save(titles.map((title, i) => ({ id: `t${i}-${title.length}`, title, list: 'Work', due: undefined })));
}

describe('the Today card for assistant arrivals', () => {
  it('names what arrived, and OK hides it for good', async () => {
    const ctx = setup();
    await arrive(ctx, 'Pay the plumber', 'Book dentist');
    const view = renderAt(ctx, '#/today');
    expect(await screen.findByText('2 new to-dos from your assistant: Pay the plumber and Book dentist')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(card()).toBeNull();

    view.unmount();
    renderAt(ctx, '#/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await waitFor(() => expect(screen.queryByText(/new to-do/)).toBeNull());
  });

  it('stays until OK across a reopen', async () => {
    const ctx = setup();
    await arrive(ctx, 'Pay the plumber');
    renderAt(ctx, '#/today').unmount();
    renderAt(ctx, '#/today');
    expect(await screen.findByText('1 new to-do from your assistant: Pay the plumber')).toBeInTheDocument();
  });

  it('never shows on an install that was never paired', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderAt(ctx, '#/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).toBeNull();
  });

  it('shows only on Today, between the install card and the backup reminder', async () => {
    const ctx = setup();
    await arrive(ctx, 'Pay the plumber');
    await ctx.itemsRepo.create({ title: 'Stretch', listId: 'list-1', type: 'daily' });
    renderAt(ctx, '#/today', { installHint: installHintFor().hint });
    const notice = await screen.findByRole('region', { name: 'New from your assistant' });
    const install = screen.getByRole('region', { name: 'Install this app' });
    const reminder = await screen.findByRole('complementary', { name: 'Backup reminder' });
    expect(install.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(reminder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(['#/lists', '#/history', '#/list/list-2'])('is not on %s', async (hash) => {
    const ctx = setup();
    await arrive(ctx, 'Pay the plumber');
    renderAt(ctx, hash);
    await screen.findAllByRole('heading', { level: 1 });
    expect(card()).toBeNull();
  });

  it('shows names as plain text', async () => {
    const ctx = setup();
    await arrive(ctx, '<img src=x onerror=alert(1)>');
    const { container } = renderAt(ctx, '#/today');
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('still hides for this visit when OK cannot be saved', async () => {
    const ctx = setup();
    await arrive(ctx, 'Pay the plumber');
    renderAt(ctx, '#/today');
    await screen.findByRole('region', { name: 'New from your assistant' });
    vi.spyOn(ctx.assistantRepo, 'dismissUnseen').mockResolvedValueOnce({ ok: false, error: 'nope' });
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(card()).toBeNull();
  });
});
