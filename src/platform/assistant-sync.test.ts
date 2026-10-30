import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createAssistantRepo } from '../data/assistant-repo';
import { createDb } from '../data/db';
import { createListsRepo } from '../data/lists-repo';
import { ACK_URL, TODOS_URL } from '../domain/assistant';
import { err } from '../domain/result';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import { createAssistantSync, type FetchLike } from './assistant-sync';

let dbCounter = 0;
const START = new Date(2026, 9, 30, 9, 0).getTime();
const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';

interface Call {
  url: string;
  init: RequestInit;
}

type Reply = { status: number; body?: unknown } | 'throw' | 'bad-json' | 'hang';

/** A fetch that records every call and answers from a script; no real network. */
function fakeFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const reply = replies.shift() ?? { status: 200, body: { acknowledged: 0 } };
    if (reply === 'throw') return Promise.reject(new TypeError('Load failed'));
    if (reply === 'hang') {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    return Promise.resolve({
      ok: reply !== 'bad-json' && reply.status >= 200 && reply.status < 300,
      status: reply === 'bad-json' ? 200 : reply.status,
      json: () => (reply === 'bad-json' ? Promise.reject(new SyntaxError('bad')) : Promise.resolve(reply.body)),
    });
  };
  return { fetch, calls };
}

const pending = (...ids: string[]) => ({
  status: 200,
  body: { version: 1, todos: ids.map((id) => ({ id, title: `To-do ${id}`, list: 'Work', due: null, note: '' })) },
});

async function setup(options: { paired?: boolean; online?: boolean; replies?: Reply[]; timeoutMs?: number } = {}) {
  const db = createDb(`assistant-sync-${++dbCounter}`);
  await createListsRepo(db, { starters: FIXTURE_LISTS }).ensureStarterLists();
  const repo = createAssistantRepo(db);
  if (options.paired ?? true) await repo.pair(CODE);
  const { fetch, calls } = fakeFetch(...(options.replies ?? []));
  let online = options.online ?? true;
  let now = START;
  const sync = createAssistantSync({
    repo,
    fetch,
    isOnline: () => online,
    now: () => now,
    timeoutMs: options.timeoutMs,
  });
  return {
    db,
    repo,
    sync,
    calls,
    goOnline: (value: boolean) => {
      online = value;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('family safety', () => {
  it('an unpaired app makes no request at all', async () => {
    const { sync, calls } = await setup({ paired: false });
    expect(await sync.sync()).toBe('unpaired');
    expect(await sync.sync({ force: true })).toBe('unpaired');
    expect(calls).toEqual([]);
  });

  it('after Remove, no request is made', async () => {
    const { repo, sync, calls } = await setup({ replies: [pending('t1')] });
    await sync.sync();
    await repo.unpair();
    expect(await sync.sync({ force: true })).toBe('unpaired');
    expect(calls).toHaveLength(2);
  });

  it('a paired app sends only its code and received ids, only to the assistant', async () => {
    const { sync, calls } = await setup({ replies: [pending('t1', 't2')] });
    await sync.sync();
    expect(calls.map((c) => c.url)).toEqual([TODOS_URL, ACK_URL]);
    for (const call of calls) {
      expect(call.init.credentials).toBe('omit');
      expect(call.init.cache).toBe('no-store');
      expect(new Headers(call.init.headers).get('authorization')).toBe(`Bearer ${CODE}`);
    }
    expect(calls[0]!.init.method ?? 'GET').toBe('GET');
    expect(calls[0]!.init.body).toBeUndefined();
    expect(calls[1]!.init.method).toBe('POST');
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ ids: ['t1', 't2'] });
    const sent = calls.map((c) => String(c.init.body ?? '')).join(' ');
    for (const word of ['Work', 'Fitness', 'Personal', 'To-do t1']) expect(sent).not.toContain(word);
  });
});

describe('receiving', () => {
  it('saves new to-dos, acknowledges them and records the sync', async () => {
    const { db, repo, sync } = await setup({ replies: [pending('t1', 't2')] });
    expect(await sync.sync()).toEqual({ received: 2 });
    expect(await db.items.where('assistantId').anyOf('t1', 't2').count()).toBe(2);
    expect(await repo.status()).toMatchObject({ value: { connected: true, lastSyncAt: START } });
  });

  it('acknowledges a to-do it already has, without adding it again', async () => {
    const { db, sync, calls, advance } = await setup({ replies: [pending('t1'), { status: 500 }, pending('t1')] });
    await sync.sync();
    advance(60_000);
    expect(await sync.sync()).toEqual({ received: 0 });
    expect(await db.items.where('assistantId').equals('t1').count()).toBe(1);
    expect(JSON.parse(calls[3]!.init.body as string)).toEqual({ ids: ['t1'] });
  });

  it('does not acknowledge to-dos it skipped as malformed', async () => {
    const bad = { status: 200, body: { version: 1, todos: [{ id: 'bad', title: '', list: '', due: null }, { id: 'ok', title: 'Fine', list: '', due: null }] } };
    const { sync, calls } = await setup({ replies: [bad] });
    expect(await sync.sync()).toEqual({ received: 1 });
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ ids: ['ok'] });
  });

  it('sends no acknowledgement when nothing is waiting', async () => {
    const { repo, sync, calls } = await setup({ replies: [pending()] });
    expect(await sync.sync()).toEqual({ received: 0 });
    expect(calls).toHaveLength(1);
    expect(await repo.status()).toMatchObject({ value: { lastSyncAt: START } });
  });

  it('does not acknowledge anything if saving fails', async () => {
    const { repo, sync, calls } = await setup({ replies: [pending('t1')] });
    vi.spyOn(repo, 'save').mockResolvedValue(err('lost'));
    expect(await sync.sync()).toBe('failed');
    expect(calls).toHaveLength(1);
  });
});

describe('when the assistant refuses or fails', () => {
  it('a 401 marks the app not connected and stops all further requests', async () => {
    const { repo, sync, calls, advance } = await setup({ replies: [{ status: 401, body: { error: 'unauthorized' } }] });
    expect(await sync.sync()).toBe('not-connected');
    expect(await repo.status()).toMatchObject({ value: { paired: true, connected: false } });
    advance(3_600_000);
    expect(await sync.sync({ force: true })).toBe('not-connected');
    expect(calls).toHaveLength(1);
  });

  it('pairing again after a 401 resumes syncing', async () => {
    const { repo, sync, calls } = await setup({ replies: [{ status: 401 }, pending('t1')] });
    await sync.sync();
    await repo.pair(CODE);
    expect(await sync.sync({ force: true })).toEqual({ received: 1 });
    expect(calls).toHaveLength(3);
  });

  it('a 401 on the acknowledgement also marks the app not connected', async () => {
    const { repo, sync } = await setup({ replies: [pending('t1'), { status: 401 }] });
    expect(await sync.sync()).toBe('not-connected');
    expect(await repo.status()).toMatchObject({ value: { connected: false } });
  });

  it.each([
    ['a 503', { status: 503 }],
    ['a network failure', 'throw'],
    ['an unreadable answer', 'bad-json'],
  ] as const)('%s saves nothing and acknowledges nothing', async (_label, reply) => {
    const { db, repo, sync, calls } = await setup({ replies: [reply as Reply] });
    expect(await sync.sync()).toBe('failed');
    expect(calls).toHaveLength(1);
    expect(await db.items.where('assistantId').above('').count()).toBe(0);
    expect(await repo.status()).toMatchObject({ value: { connected: true, lastSyncAt: null } });
  });

  it('a failed acknowledgement is retried by the next sync', async () => {
    const { sync, calls, advance } = await setup({ replies: [pending('t1'), 'throw', pending('t1')] });
    expect(await sync.sync()).toBe('failed');
    advance(60_000);
    expect(await sync.sync()).toEqual({ received: 0 });
    expect(JSON.parse(calls[3]!.init.body as string)).toEqual({ ids: ['t1'] });
  });

  it('gives up on a request that takes too long', async () => {
    const { sync } = await setup({ replies: ['hang'], timeoutMs: 20 });
    expect(await sync.sync()).toBe('failed');
  });
});

describe('when and how often', () => {
  it('does not try while offline', async () => {
    const { sync, calls, goOnline } = await setup({ online: false, replies: [pending('t1')] });
    expect(await sync.sync({ force: true })).toBe('offline');
    expect(calls).toEqual([]);
    goOnline(true);
    expect(await sync.sync()).toEqual({ received: 1 });
  });

  it('asks at most once a minute unless forced', async () => {
    const { sync, calls, advance } = await setup({ replies: [pending(), pending(), pending()] });
    await sync.sync();
    advance(59_999);
    expect(await sync.sync()).toBe('throttled');
    expect(calls).toHaveLength(1);
    advance(1);
    expect(await sync.sync()).toEqual({ received: 0 });
    expect(await sync.sync({ force: true })).toEqual({ received: 0 });
    expect(calls).toHaveLength(3);
  });

  it('runs one sync at a time', async () => {
    const { sync, calls } = await setup({ replies: [pending('t1')] });
    const [first, second] = await Promise.all([sync.sync(), sync.sync({ force: true })]);
    expect(first).toEqual({ received: 1 });
    expect(second).toBe('busy');
    expect(calls.filter((c) => c.url === TODOS_URL)).toHaveLength(1);
  });
});
