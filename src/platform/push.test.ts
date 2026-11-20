import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createAssistantRepo } from '../data/assistant-repo';
import { createDb, type HabitDb } from '../data/db';
import { createNotifyRepo } from '../data/notify-repo';
import { PUSH_DUE_DAYS_URL, PUSH_KEY_URL, PUSH_SUBSCRIPTION_URL } from '../domain/assistant';
import type { FetchLike } from './assistant-sync';
import { createPush, keyBytes, type PushEnv, type SubscriptionLike } from './push';

let dbCounter = 0;
const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';
const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const ENDPOINT = 'https://web.push.apple.com/abc';

interface Call {
  url: string;
  init: RequestInit;
}
type Reply = { status: number; body?: unknown } | 'throw' | 'hang';

function fakeFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const reply = replies.shift() ?? { status: 204 };
    if (reply === 'throw') return Promise.reject(new TypeError('Load failed'));
    if (reply === 'hang') {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    return Promise.resolve({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    });
  };
  return { fetch, calls };
}

function fakeSubscription(): SubscriptionLike & { unsubscribed: boolean } {
  return {
    unsubscribed: false,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
    async unsubscribe() {
      this.unsubscribed = true;
      return true;
    },
  };
}

interface Options {
  paired?: boolean;
  online?: boolean;
  hasPush?: boolean;
  isIos?: boolean;
  answer?: NotificationPermission;
  replies?: Reply[];
  timeoutMs?: number;
}

async function setup(options: Options = {}) {
  const db: HabitDb = createDb(`push-${++dbCounter}`);
  const assistant = createAssistantRepo(db);
  if (options.paired ?? true) await assistant.pair(CODE);
  const notify = createNotifyRepo(db);
  const { fetch, calls } = fakeFetch(...(options.replies ?? []));
  let permission: NotificationPermission = 'default';
  let subscription: ReturnType<typeof fakeSubscription> | null = null;
  const keys: Uint8Array[] = [];
  let online = options.online ?? true;
  const env: PushEnv = {
    hasPush: options.hasPush ?? true,
    isIos: options.isIos ?? true,
    permission: () => permission,
    requestPermission: async () => (permission = options.answer ?? 'granted'),
    subscribe: async (key) => {
      keys.push(key);
      return (subscription = fakeSubscription());
    },
    currentSubscription: async () => subscription,
    timeZone: () => 'America/Denver',
  };
  const push = createPush({
    env,
    notify,
    assistant,
    fetch,
    isOnline: () => online,
    timeoutMs: options.timeoutMs ?? 50,
  });
  const addTodo = (id: string, extra: Record<string, unknown> = {}) =>
    db.items.add({ id, listId: 'l', type: 'todo', title: `Title ${id}`, order: 0, ...extra });
  return {
    db,
    push,
    notify,
    assistant,
    calls,
    keys,
    addTodo,
    subscription: () => subscription,
    goOffline: () => (online = false),
    forgetSubscription: () => (subscription = null),
    revokePermission: () => (permission = 'denied'),
  };
}

const body = (call: Call) => JSON.parse(call.init.body as string) as Record<string, unknown>;

describe('keyBytes', () => {
  it('decodes a base64url VAPID key to its 65 bytes', () => {
    const bytes = keyBytes(KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe('state', () => {
  it('reports support, permission and whether notifications are on', async () => {
    expect(await (await setup()).push.state()).toEqual({ support: 'supported', permission: 'default', on: false });
    expect(await (await setup({ hasPush: false })).push.state()).toMatchObject({ support: 'needs-home-screen' });
    expect(await (await setup({ hasPush: false, isIos: false })).push.state()).toMatchObject({
      support: 'unsupported',
      permission: 'default',
    });
  });

  it('reads as off when the setting cannot be read', async () => {
    const t = await setup();
    t.db.close();
    expect((await t.push.state()).on).toBe(false);
  });
});

describe('enable', () => {
  it('asks permission, subscribes with the server key, registers and sends due days', async () => {
    const t = await setup({ replies: [{ status: 200, body: { publicKey: KEY } }] });
    await t.addTodo('a', { dueDate: '2026-11-20', note: 'secret note' });
    await t.addTodo('b', { dueDate: '2026-11-18' });
    await t.addTodo('c');

    expect(await t.push.enable()).toBe('on');
    expect(t.keys[0]).toEqual(keyBytes(KEY));
    expect(t.calls.map((c) => [c.init.method, c.url])).toEqual([
      ['GET', PUSH_KEY_URL],
      ['PUT', PUSH_SUBSCRIPTION_URL],
      ['PUT', PUSH_DUE_DAYS_URL],
    ]);
    expect(body(t.calls[1]!)).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: 'p', auth: 'a' },
      timeZone: 'America/Denver',
    });
    expect(body(t.calls[2]!)).toEqual({ days: ['2026-11-18', '2026-11-20'], timeZone: 'America/Denver' });
    for (const call of t.calls) {
      expect(new Headers(call.init.headers).get('Authorization')).toBe(`Bearer ${CODE}`);
      expect(call.init.credentials).toBe('omit');
      expect(String(call.init.body ?? '')).not.toMatch(/Title|secret/);
    }
    expect(await t.push.state()).toMatchObject({ permission: 'granted', on: true });
  });

  it('reuses an existing subscription', async () => {
    const t = await setup({ replies: [{ status: 200, body: { publicKey: KEY } }, { status: 204 }, { status: 204 }] });
    await t.push.enable();
    const first = t.subscription();
    await t.push.disable();
    expect(first?.unsubscribed).toBe(true);
  });

  it('sends nothing when permission is declined', async () => {
    const t = await setup({ answer: 'denied' });
    expect(await t.push.enable()).toBe('blocked');
    expect(t.calls).toEqual([]);
    expect(await t.push.state()).toMatchObject({ permission: 'denied', on: false });
  });

  it('never asks or calls for an unpaired or disconnected phone', async () => {
    const unpaired = await setup({ paired: false });
    expect(await unpaired.push.enable()).toBe('not-connected');
    expect(unpaired.calls).toEqual([]);

    const cut = await setup();
    await cut.assistant.markNotConnected();
    expect(await cut.push.enable()).toBe('not-connected');
    expect(cut.calls).toEqual([]);
  });

  it('fails without push support or offline, before asking', async () => {
    const noPush = await setup({ hasPush: false });
    expect(await noPush.push.enable()).toBe('failed');
    const offline = await setup({ online: false });
    expect(await offline.push.enable()).toBe('failed');
    expect((await offline.push.state()).permission).toBe('default');
  });

  it('fails and stays off when the assistant cannot be reached or sends no key', async () => {
    const down = await setup({ replies: ['throw'] });
    expect(await down.push.enable()).toBe('failed');
    expect((await down.push.state()).on).toBe(false);

    const noKey = await setup({ replies: [{ status: 200, body: {} }] });
    expect(await noKey.push.enable()).toBe('failed');

    const slow = await setup({ replies: ['hang'] });
    expect(await slow.push.enable()).toBe('failed');
  });

  it('marks the pairing not connected on a 401', async () => {
    const t = await setup({ replies: [{ status: 401 }] });
    expect(await t.push.enable()).toBe('not-connected');
    expect((await t.assistant.status()).ok && (await t.assistant.status())).toMatchObject({
      value: { connected: false },
    });
  });

  it('is on even if the first due days fail; they go next time', async () => {
    const t = await setup({ replies: [{ status: 200, body: { publicKey: KEY } }, { status: 204 }, { status: 500 }] });
    expect(await t.push.enable()).toBe('on');
    expect(await t.push.syncDueDays()).toBe('sent');
  });

  it('a 401 on the first due days still says not connected', async () => {
    const t = await setup({ replies: [{ status: 200, body: { publicKey: KEY } }, { status: 204 }, { status: 401 }] });
    expect(await t.push.enable()).toBe('not-connected');
  });

  it('fails when the setting cannot be saved', async () => {
    const t = await setup({ replies: [{ status: 200, body: { publicKey: KEY } }, { status: 204 }] });
    t.notify.setOn = async () => ({ ok: false, error: 'full' });
    expect(await t.push.enable()).toBe('failed');
  });
});

describe('disable', () => {
  it('unsubscribes on the phone, forgets the setting and tells the assistant', async () => {
    const t = await setup({ replies: [{ status: 200, body: { publicKey: KEY } }] });
    await t.push.enable();
    const sub = t.subscription()!;
    await t.push.disable();
    expect(sub.unsubscribed).toBe(true);
    expect(t.calls.at(-1)).toMatchObject({ url: PUSH_SUBSCRIPTION_URL, init: { method: 'DELETE' } });
    expect(await t.push.state()).toMatchObject({ on: false });
    expect(await t.notify.sent()).toEqual({ ok: true, value: null });
  });

  it('turns off even if unsubscribing or the assistant fails, and skips the call offline or unpaired', async () => {
    const t = await setup({ replies: ['throw'] });
    await t.notify.setOn(true);
    await t.push.disable();
    expect((await t.push.state()).on).toBe(false);

    const offline = await setup({ online: false });
    await offline.push.disable();
    expect(offline.calls).toEqual([]);

    const unpaired = await setup({ paired: false });
    await unpaired.push.disable();
    expect(unpaired.calls).toEqual([]);
  });

  it('survives a subscription that refuses to unsubscribe', async () => {
    const db = createDb(`push-${++dbCounter}`);
    const assistant = createAssistantRepo(db);
    await assistant.pair(CODE);
    const notify = createNotifyRepo(db);
    await notify.setOn(true);
    const { fetch, calls } = fakeFetch();
    const push = createPush({
      env: {
        hasPush: true,
        isIos: true,
        permission: () => 'granted',
        requestPermission: async () => 'granted',
        subscribe: async () => fakeSubscription(),
        currentSubscription: async () => ({
          toJSON: () => ({}),
          unsubscribe: () => Promise.reject(new Error('gone')),
        }),
        timeZone: () => 'America/Denver',
      },
      notify,
      assistant,
      fetch,
      isOnline: () => true,
    });
    await push.disable();
    expect(calls).toHaveLength(1);
    expect((await push.state()).on).toBe(false);
  });
});

describe('reregister', () => {
  async function enabled(replies: Reply[] = [], options: Options = {}) {
    const t = await setup({
      ...options,
      replies: [{ status: 200, body: { publicKey: KEY } }, { status: 204 }, { status: 204 }, ...replies],
    });
    await t.push.enable();
    t.calls.length = 0;
    return t;
  }

  it('sends the same push address again on app start', async () => {
    const t = await enabled();
    expect(await t.push.reregister()).toBe('sent');
    expect(t.calls.map((c) => [c.init.method, c.url])).toEqual([['PUT', PUSH_SUBSCRIPTION_URL]]);
    expect(body(t.calls[0]!)).toMatchObject({ endpoint: ENDPOINT, timeZone: 'America/Denver' });
  });

  it('makes a new subscription if the phone lost it', async () => {
    const t = await enabled([{ status: 200, body: { publicKey: KEY } }]);
    t.forgetSubscription();
    expect(await t.push.reregister()).toBe('sent');
    expect(t.calls.map((c) => [c.init.method, c.url])).toEqual([
      ['GET', PUSH_KEY_URL],
      ['PUT', PUSH_SUBSCRIPTION_URL],
    ]);
    expect(t.subscription()).not.toBeNull();
  });

  it('fails when a lost subscription cannot get a key', async () => {
    const t = await enabled([{ status: 200, body: {} }]);
    t.forgetSubscription();
    expect(await t.push.reregister()).toBe('failed');
  });

  it('does nothing when off, offline or not connected', async () => {
    const off = await setup();
    expect(await off.push.reregister()).toBe('skipped');
    const offline = await enabled();
    offline.goOffline();
    expect(await offline.push.reregister()).toBe('skipped');
    const cut = await enabled();
    await cut.assistant.markNotConnected();
    expect(await cut.push.reregister()).toBe('skipped');
    expect([...offline.calls, ...cut.calls]).toEqual([]);
  });

  it('turns off when the phone no longer allows notifications', async () => {
    const t = await enabled();
    t.revokePermission();
    expect(await t.push.reregister()).toBe('off');
    expect((await t.push.state()).on).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('turns off where push is no longer available', async () => {
    const t = await setup({ hasPush: false });
    await t.notify.setOn(true);
    expect(await t.push.reregister()).toBe('off');
  });

  it('reports failures and a refused code', async () => {
    const down = await enabled(['throw']);
    expect(await down.push.reregister()).toBe('failed');
    const refused = await enabled([{ status: 401 }]);
    expect(await refused.push.reregister()).toBe('not-connected');
  });
});

describe('syncDueDays', () => {
  async function enabled(replies: Reply[] = []) {
    const t = await setup({ replies: [{ status: 200, body: { publicKey: KEY } }, { status: 204 }, { status: 204 }, ...replies] });
    await t.addTodo('a', { dueDate: '2026-11-20' });
    await t.push.enable();
    t.calls.length = 0;
    return t;
  }

  it('sends again after a change, skipping done, deleted and undated to-dos', async () => {
    const t = await enabled();
    await t.addTodo('b', { dueDate: '2026-11-24' });
    await t.addTodo('c', { dueDate: '2026-11-19', completedAt: 1 });
    await t.addTodo('d', { dueDate: '2026-11-21', archivedAt: 1 });
    expect(await t.push.syncDueDays({ keepalive: true })).toBe('sent');
    expect(body(t.calls[0]!)).toEqual({ days: ['2026-11-20', '2026-11-24'], timeZone: 'America/Denver' });
    expect(t.calls[0]!.init.keepalive).toBe(true);
  });

  it('does not resend unchanged days', async () => {
    const t = await enabled();
    expect(await t.push.syncDueDays()).toBe('unchanged');
    expect(t.calls).toEqual([]);
  });

  it('sends an empty list when nothing is due', async () => {
    const t = await enabled();
    await t.db.items.update('a', { completedAt: 5 });
    expect(await t.push.syncDueDays()).toBe('sent');
    expect(body(t.calls[0]!)).toEqual({ days: [], timeZone: 'America/Denver' });
  });

  it('skips when off, unpaired, disconnected or offline', async () => {
    const off = await setup();
    expect(await off.push.syncDueDays()).toBe('skipped');

    const t = await enabled();
    await t.db.items.update('a', { dueDate: '2026-11-22' });
    t.goOffline();
    expect(await t.push.syncDueDays()).toBe('skipped');
    expect(t.calls).toEqual([]);

    const cut = await enabled();
    await cut.assistant.markNotConnected();
    expect(await cut.push.syncDueDays()).toBe('skipped');

    const unpaired = await enabled();
    await unpaired.assistant.unpair();
    expect(await unpaired.push.syncDueDays()).toBe('skipped');

    const broken = await setup();
    broken.db.close();
    expect(await broken.push.syncDueDays()).toBe('skipped');
  });

  it('retries a failed send next time', async () => {
    const t = await enabled([{ status: 500 }]);
    await t.db.items.update('a', { dueDate: '2026-11-22' });
    expect(await t.push.syncDueDays()).toBe('failed');
    expect(await t.push.syncDueDays()).toBe('sent');
    expect(t.calls).toHaveLength(2);
  });

  it('stops on a 401', async () => {
    const t = await enabled([{ status: 401 }]);
    await t.db.items.update('a', { dueDate: '2026-11-22' });
    expect(await t.push.syncDueDays()).toBe('not-connected');
    expect(await t.push.syncDueDays()).toBe('skipped');
  });

  it('fails when the to-dos cannot be read', async () => {
    const t = await enabled();
    const real = t.notify.todos;
    t.notify.todos = async () => ({ ok: false, error: 'x' });
    expect(await t.push.syncDueDays()).toBe('failed');
    t.notify.todos = real;
  });
});
