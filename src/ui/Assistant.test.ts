import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '../platform/assistant-sync';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import AssistantSheet from './AssistantSheet.svelte';
import Router from './Router.svelte';
import VersionLine from './VersionLine.svelte';

const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';
const BAD_CODE = "That doesn't look like a pairing code. Copy it again from your assistant.";
const NOT_CONNECTED = 'Not connected. Get a new code from your assistant and paste it here.';

afterEach(() => {
  vi.useRealTimers();
});

describe('the version line', () => {
  function setup() {
    vi.useFakeTimers();
    const onHold = vi.fn();
    render(VersionLine, { props: { onHold } });
    return { onHold, line: screen.getByText('Version 0.1.0') };
  }

  it('opens after a 3-second press and hold', async () => {
    const { onHold, line } = setup();
    await fireEvent.pointerDown(line, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(2_999);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a tap or a short press', async () => {
    const { onHold, line } = setup();
    await fireEvent.click(line);
    await fireEvent.pointerDown(line);
    vi.advanceTimersByTime(2_000);
    await fireEvent.pointerUp(line);
    vi.advanceTimersByTime(5_000);
    expect(onHold).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['pointerCancel', 'pointerLeave', 'blur'] as const)('stops counting on %s', async (event) => {
    const { onHold, line } = setup();
    await fireEvent.pointerDown(line);
    vi.advanceTimersByTime(1_000);
    await fireEvent[event](line);
    vi.advanceTimersByTime(5_000);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('stops counting when the finger moves, as when scrolling', async () => {
    const { onHold, line } = setup();
    await fireEvent.pointerDown(line, { clientX: 10, clientY: 10 });
    await fireEvent.pointerMove(line, { clientX: 12, clientY: 14 });
    await fireEvent.pointerMove(line, { clientX: 10, clientY: 40 });
    vi.advanceTimersByTime(5_000);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('opens when Enter or Space is held for 3 seconds', async () => {
    const { onHold, line } = setup();
    expect(line).toHaveAttribute('tabindex', '0');
    await fireEvent.keyDown(line, { key: 'Enter' });
    await fireEvent.keyDown(line, { key: 'Enter', repeat: true });
    vi.advanceTimersByTime(3_000);
    expect(onHold).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(line, { key: ' ' });
    vi.advanceTimersByTime(1_000);
    await fireEvent.keyUp(line, { key: ' ' });
    vi.advanceTimersByTime(5_000);
    await fireEvent.keyDown(line, { key: 'a' });
    vi.advanceTimersByTime(5_000);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('keeps the long-press text menu from appearing', async () => {
    const { line } = setup();
    const event = new Event('contextmenu', { cancelable: true });
    line.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('the Assistant sheet', () => {
  function setup(sync: (ctx: AppCtx, force: boolean) => Promise<SyncResult> = async () => ({ received: 0 })) {
    const ctx = setupApp(new Date(2026, 9, 30, 9, 0), 'assistant-ui');
    const runSync = vi.fn((force?: boolean) => sync(ctx, force ?? false));
    const onClose = vi.fn();
    const view = () => render(AssistantSheet, { props: { repo: ctx.assistantRepo, runSync, onClose } });
    return { ctx, runSync, onClose, view };
  }

  it('starts unpaired with a labelled code field', async () => {
    const { view } = setup();
    view();
    expect(await screen.findByText('Not paired')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Assistant' })).toBeInTheDocument();
    expect(screen.getByLabelText('Pairing code')).toHaveAttribute('autocomplete', 'off');
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('refuses something that is not a pairing code, without any request', async () => {
    const { ctx, runSync, view } = setup();
    view();
    await fireEvent.input(screen.getByLabelText('Pairing code'), { target: { value: 'hello' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(BAD_CODE);
    expect(runSync).not.toHaveBeenCalled();
    expect(await ctx.assistantRepo.code()).toBeNull();
  });

  it('pairs, syncs at once and shows the connection', async () => {
    const { ctx, runSync, view } = setup(async (c) => {
      await c.assistantRepo.markSynced(new Date(2026, 9, 30, 9, 1).getTime());
      return { received: 1 };
    });
    view();
    await fireEvent.input(screen.getByLabelText('Pairing code'), { target: { value: ` ${CODE} ` } });
    await fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
    expect(await screen.findByText('Connected to your assistant')).toBeInTheDocument();
    expect(screen.getByText(/^Last synced /)).toBeInTheDocument();
    expect(runSync).toHaveBeenCalledWith(true);
    expect(await ctx.assistantRepo.code()).toBe(CODE);
    expect(screen.getByLabelText('Pairing code')).toHaveValue('');
  });

  it('explains a lost connection', async () => {
    const { ctx, view } = setup();
    await ctx.assistantRepo.pair(CODE);
    await ctx.assistantRepo.markNotConnected();
    view();
    expect(await screen.findByText(NOT_CONNECTED)).toBeInTheDocument();
  });

  it('Remove unpairs without any request', async () => {
    const { ctx, runSync, view } = setup();
    await ctx.assistantRepo.pair(CODE);
    view();
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Not paired')).toBeInTheDocument();
    expect(await ctx.assistantRepo.code()).toBeNull();
    expect(runSync).not.toHaveBeenCalled();
  });

  it('closes with Close or Escape', async () => {
    const { onClose, view } = setup();
    view();
    await fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows a storage failure instead of a status', async () => {
    const { ctx, view } = setup();
    vi.spyOn(ctx.assistantRepo, 'status').mockResolvedValue({ ok: false, error: 'Could not load' });
    vi.spyOn(ctx.assistantRepo, 'pair').mockResolvedValue({ ok: false, error: 'Could not save' });
    vi.spyOn(ctx.assistantRepo, 'unpair').mockResolvedValue({ ok: false, error: 'Could not remove' });
    view();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
    await fireEvent.input(screen.getByLabelText('Pairing code'), { target: { value: CODE } });
    await fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save'));
  });
});

describe('on the Lists tab', () => {
  it('the version line is at the bottom and its hold opens the Assistant sheet', async () => {
    const ctx = setupApp(new Date(2026, 9, 30, 9, 0), 'assistant-router');
    location.hash = '#/lists';
    render(Router, { props: routerProps(ctx) });
    const line = await screen.findByText('Version 0.1.0');
    vi.useFakeTimers();
    await fireEvent.pointerDown(line);
    vi.advanceTimersByTime(3_000);
    vi.useRealTimers();
    expect(await screen.findByRole('dialog', { name: 'Assistant' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assistant' })).toBeNull());
  });

  it('shows newly received to-dos when the revision changes', async () => {
    const ctx = setupApp(new Date(2026, 9, 30, 9, 0), 'assistant-revision');
    await ctx.listsRepo.ensureStarterLists();
    location.hash = '#/list/list-2';
    const view = render(Router, { props: { ...routerProps(ctx), revision: 0 } });
    await screen.findByRole('heading', { level: 1 });
    await ctx.assistantRepo.save([{ id: 't1', title: 'Call Dave', list: 'Work', due: undefined }]);
    expect(screen.queryByText('Call Dave')).toBeNull();
    await view.rerender({ ...routerProps(ctx), revision: 1 });
    expect(await screen.findByText('Call Dave')).toBeInTheDocument();
  });
});
