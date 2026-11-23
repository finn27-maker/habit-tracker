import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '../platform/assistant-sync';
import type { EnableResult, Push, PushState } from '../platform/push';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import AssistantSheet from './AssistantSheet.svelte';
import Router from './Router.svelte';

const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';
const ON_TEXT = 'On: new to-dos from your assistant, and a 7:00 am summary when something is due.';
// The owner renamed the Home Screen icon, and iOS lists the app in Settings under that name.
const BLOCKED = /^\s*Notifications are blocked\. Turn them on in Settings, Notifications, under this app's Home\s+Screen name\.\s*$/;
const FAILED = "Couldn't turn on notifications. Check your connection and try again.";

/** A stand-in for platform/push: records what the screen asks for. */
function fakePush(start: Partial<PushState> = {}, enableResult: EnableResult = 'on') {
  let state: PushState = { support: 'supported', permission: 'default', on: false, ...start };
  const log: string[] = [];
  const push: Push = {
    state: async () => state,
    enable: async () => {
      log.push('enable');
      if (enableResult === 'on') state = { ...state, permission: 'granted', on: true };
      if (enableResult === 'blocked') state = { ...state, permission: 'denied' };
      return enableResult;
    },
    disable: async () => {
      log.push('disable');
      state = { ...state, on: false };
    },
    syncDueDays: async () => 'skipped',
    reregister: async () => 'skipped',
  };
  return { push, log };
}

/** The Lists tab, as the owner's paired phone shows it (s31). */
async function lists(ctx: AppCtx, push: Push, paired = true) {
  if (paired) await ctx.assistantRepo.pair(CODE);
  location.hash = '#/lists';
  render(Router, { props: { ...routerProps(ctx), push } });
  await screen.findByRole('region', { name: 'Backup' });
}

const section = () => screen.queryByRole('region', { name: 'Notifications' });
const turnOn = () => screen.queryByRole('button', { name: 'Turn on notifications' });

/** Opens the Assistant sheet the way the owner does: a 3-second hold on the version line. */
async function openSheet() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await fireEvent.pointerDown(screen.getByText('Version 0.1.0'));
  vi.advanceTimersByTime(3_000);
  vi.useRealTimers();
  return screen.findByRole('dialog', { name: 'Assistant' });
}

describe('Notifications on the Lists tab', () => {
  it('sits directly above Backup and turns on', async () => {
    const { push, log } = fakePush();
    await lists(setupApp(), push);

    const notifications = await screen.findByRole('region', { name: 'Notifications' });
    const backup = screen.getByRole('region', { name: 'Backup' });
    expect(notifications.compareDocumentPosition(backup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notifications.nextElementSibling).toBe(backup);

    await fireEvent.click(within(notifications).getByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText(ON_TEXT)).toBeInTheDocument();
    expect(log).toEqual(['enable']);
    expect(turnOn()).toBeNull();
  });

  it('turns off', async () => {
    const { push, log } = fakePush({ permission: 'granted', on: true });
    await lists(setupApp(), push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn off notifications' }));
    expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
    expect(log).toEqual(['disable']);
  });

  it('explains a declined permission', async () => {
    await lists(setupApp(), fakePush({}, 'blocked').push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(turnOn()).toBeNull();
  });

  it('shows the blocked text with no button when blocked before', async () => {
    await lists(setupApp(), fakePush({ permission: 'denied' }).push);
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(turnOn()).toBeNull();
  });

  it('says to open from the Home Screen in a Safari tab, or that the browser cannot', async () => {
    await lists(setupApp(), fakePush({ support: 'needs-home-screen' }).push);
    expect(await screen.findByText('To get notifications, open this app from your Home Screen.')).toBeInTheDocument();
    expect(turnOn()).toBeNull();
  });

  it('says when the browser has no notifications', async () => {
    await lists(setupApp(), fakePush({ support: 'unsupported' }).push);
    expect(await screen.findByText("This browser can't show notifications.")).toBeInTheDocument();
  });

  it('shows an error and stays off when turning on fails', async () => {
    await lists(setupApp(), fakePush({}, 'failed').push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED);
    expect(turnOn()).toBeInTheDocument();
  });

  it('disappears when the assistant refuses the code', async () => {
    const ctx = setupApp();
    const { push } = fakePush();
    push.enable = async () => {
      await ctx.assistantRepo.markNotConnected();
      return 'not-connected';
    };
    await lists(ctx, push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    await waitFor(() => expect(section()).toBeNull());
  });

  it('is not shown to an unpaired phone and asks nothing of it', async () => {
    const { push } = fakePush();
    const state = vi.spyOn(push, 'state');
    await lists(setupApp(), push, false);
    expect(section()).toBeNull();
    expect(state).not.toHaveBeenCalled();
  });

  it('is not shown to a disconnected phone', async () => {
    const ctx = setupApp();
    await ctx.assistantRepo.pair(CODE);
    await ctx.assistantRepo.markNotConnected();
    await lists(ctx, fakePush().push, false);
    expect(section()).toBeNull();
  });

  it('is not shown without notifications wired in', async () => {
    const ctx = setupApp();
    await ctx.assistantRepo.pair(CODE);
    location.hash = '#/lists';
    render(Router, { props: routerProps(ctx) });
    await screen.findByRole('region', { name: 'Backup' });
    expect(section()).toBeNull();
  });

  it('appears after pairing in the Assistant sheet, without a reload', async () => {
    const ctx = setupApp();
    await lists(ctx, fakePush().push, false);
    const sheet = await openSheet();
    await fireEvent.input(within(sheet).getByLabelText('Pairing code'), { target: { value: CODE } });
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Pair' }));
    await within(sheet).findByText('Connected to your assistant');
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    expect(await screen.findByRole('region', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('turns notifications off first and disappears after Remove in the sheet', async () => {
    const ctx = setupApp();
    const { push, log } = fakePush({ permission: 'granted', on: true });
    const disable = push.disable;
    push.disable = async () => {
      log.push(`code ${(await ctx.assistantRepo.code()) === CODE ? 'still there' : 'gone'}`);
      await disable();
    };
    await lists(ctx, push);
    await screen.findByRole('button', { name: 'Turn off notifications' });

    const sheet = await openSheet();
    await within(sheet).findByText('Connected to your assistant');
    expect(within(sheet).queryByRole('heading', { name: 'Notifications' })).toBeNull();
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Remove' }));
    await within(sheet).findByText('Not paired');
    expect(log).toEqual(['code still there', 'disable']);
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(section()).toBeNull());
  });
});

describe('the Assistant sheet after the move', () => {
  async function sheet(ctx: AppCtx, push?: Push) {
    await ctx.assistantRepo.pair(CODE);
    const runSync = vi.fn(async (): Promise<SyncResult> => ({ received: 0 }));
    render(AssistantSheet, { props: { repo: ctx.assistantRepo, runSync, push, onClose: () => {} } });
    await screen.findByText('Connected to your assistant');
  }

  it('has no Notifications switch but keeps pairing and Remove', async () => {
    await sheet(setupApp(), fakePush().push);
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();
    expect(turnOn()).toBeNull();
    expect(screen.getByLabelText('Pairing code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('removes without touching notifications that are off or not wired in', async () => {
    const off = fakePush();
    await sheet(setupApp(), off.push);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await screen.findByText('Not paired');
    expect(off.log).toEqual([]);
  });

  it('removes when notifications are not wired in', async () => {
    await sheet(setupApp());
    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Not paired')).toBeInTheDocument();
  });

  it('says honestly what leaves the phone', async () => {
    await sheet(setupApp(), fakePush().push);
    expect(
      screen.getByText(/with notifications on, the dates to-dos are due are sent,\s+never their names\./),
    ).toBeInTheDocument();
  });
});
