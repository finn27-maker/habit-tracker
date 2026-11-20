import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '../platform/assistant-sync';
import type { EnableResult, Push, PushState } from '../platform/push';
import { setupApp, type AppCtx } from '../testing/app-fixture';
import AssistantSheet from './AssistantSheet.svelte';

const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';
const ON_TEXT = 'On: new to-dos from your assistant, and a 7:00 am summary when something is due.';
const BLOCKED = 'Notifications are blocked. Turn them on in Settings, Notifications, Habit Tracker.';
const FAILED = "Couldn't turn on notifications. Check your connection and try again.";

/** A stand-in for platform/push: records what the sheet asks for. */
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

async function view(ctx: AppCtx, push: Push, paired = true) {
  if (paired) await ctx.assistantRepo.pair(CODE);
  const runSync = vi.fn(async (): Promise<SyncResult> => ({ received: 0 }));
  render(AssistantSheet, { props: { repo: ctx.assistantRepo, runSync, push, onClose: () => {} } });
  await screen.findByRole('status');
}

const turnOn = () => screen.queryByRole('button', { name: 'Turn on notifications' });

describe('Notifications in the Assistant sheet', () => {
  it('turns on and says what will arrive', async () => {
    const { push, log } = fakePush();
    await view(setupApp(), push);
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();

    await fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText(ON_TEXT)).toBeInTheDocument();
    expect(log).toEqual(['enable']);
    expect(turnOn()).toBeNull();
  });

  it('turns off', async () => {
    const { push, log } = fakePush({ permission: 'granted', on: true });
    await view(setupApp(), push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn off notifications' }));
    expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
    expect(log).toEqual(['disable']);
  });

  it('explains a declined or earlier-blocked permission', async () => {
    const declined = fakePush({}, 'blocked');
    await view(setupApp(), declined.push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(turnOn()).toBeNull();
  });

  it('shows the blocked text with no button when blocked before', async () => {
    await view(setupApp(), fakePush({ permission: 'denied' }).push);
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(turnOn()).toBeNull();
  });

  it('says to open from the Home Screen in a Safari tab, or that the browser cannot', async () => {
    await view(setupApp(), fakePush({ support: 'needs-home-screen' }).push);
    expect(await screen.findByText('To get notifications, open Habit Tracker from your Home Screen.')).toBeInTheDocument();
    expect(turnOn()).toBeNull();
  });

  it('says when the browser has no notifications', async () => {
    await view(setupApp(), fakePush({ support: 'unsupported' }).push);
    expect(await screen.findByText("This browser can't show notifications.")).toBeInTheDocument();
  });

  it('shows an error and stays off when turning on fails', async () => {
    await view(setupApp(), fakePush({}, 'failed').push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED);
    expect(turnOn()).toBeInTheDocument();
  });

  it('shows Not connected when the assistant refuses the code', async () => {
    const ctx = setupApp();
    const { push } = fakePush();
    push.enable = async () => {
      await ctx.assistantRepo.markNotConnected();
      return 'not-connected';
    };
    await view(ctx, push);
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText('Not connected. Get a new code from your assistant and paste it here.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();
  });

  it('is not offered to an unpaired phone', async () => {
    await view(setupApp(), fakePush().push, false);
    await screen.findByText('Not paired');
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();
  });

  it('is not offered without notifications wired in', async () => {
    const ctx = setupApp();
    await ctx.assistantRepo.pair(CODE);
    render(AssistantSheet, {
      props: { repo: ctx.assistantRepo, runSync: async () => ({ received: 0 }), onClose: () => {} },
    });
    await screen.findByText('Connected to your assistant');
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();
  });

  it('turns notifications off before forgetting the pairing on Remove', async () => {
    const ctx = setupApp();
    const { push, log } = fakePush({ permission: 'granted', on: true });
    const disable = push.disable;
    push.disable = async () => {
      log.push(`code ${(await ctx.assistantRepo.code()) === CODE ? 'still there' : 'gone'}`);
      await disable();
    };
    await view(ctx, push);
    await screen.findByRole('button', { name: 'Turn off notifications' });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(log).toEqual(['code still there', 'disable']));
    expect(await screen.findByText('Not paired')).toBeInTheDocument();
  });

  it('says honestly what leaves the phone', async () => {
    await view(setupApp(), fakePush().push);
    expect(
      await screen.findByText(/with notifications on, the dates to-dos are due are sent,\s+never their names\./),
    ).toBeInTheDocument();
  });
});
