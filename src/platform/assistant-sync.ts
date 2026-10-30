import type { AssistantRepo } from '../data/assistant-repo';
import { ACK_URL, TODOS_URL, parseTodos } from '../domain/assistant';

/** The slice of window.fetch the sync uses, so tests can pass a fake. */
export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type SyncResult =
  | 'unpaired'
  | 'not-connected'
  | 'offline'
  | 'busy'
  | 'throttled'
  | 'failed'
  | { received: number };

export interface AssistantSyncDeps {
  repo: AssistantRepo;
  fetch: FetchLike;
  isOnline: () => boolean;
  now: () => number;
  /** Abort a request after this long. */
  timeoutMs?: number;
}

export interface AssistantSync {
  /** `force` skips the once-a-minute limit (used right after pairing). */
  sync(options?: { force?: boolean }): Promise<SyncResult>;
}

const MIN_GAP_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

class Unauthorized extends Error {}

/**
 * Pulls pending to-dos from the owner's assistant, saves each once, then acknowledges them.
 * Family safety (decision 7ac92147): with no stored code it returns before any request, and
 * after a 401 it stays silent until a new code is paired. Only the code and the received ids
 * ever leave the phone. Failures are never shown; the next open simply tries again.
 */
export function createAssistantSync(deps: AssistantSyncDeps): AssistantSync {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let busy = false;
  let lastAttempt: number | null = null;

  async function call(url: string, code: string, body?: unknown) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await deps.fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${code}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) throw new Unauthorized();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(code: string): Promise<SyncResult> {
    try {
      const todos = parseTodos(await call(TODOS_URL, code));
      const saved = await deps.repo.save(todos);
      if (!saved.ok) return 'failed';
      // Only after the save has committed: an acknowledged to-do is never sent again.
      if (saved.value.ids.length > 0) await call(ACK_URL, code, { ids: saved.value.ids });
      await deps.repo.markSynced(deps.now());
      return { received: saved.value.added };
    } catch (error) {
      if (!(error instanceof Unauthorized)) return 'failed';
      await deps.repo.markNotConnected();
      return 'not-connected';
    }
  }

  return {
    async sync(options = {}) {
      if (busy) return 'busy';
      busy = true;
      try {
        const code = await deps.repo.code();
        if (code === null) return 'unpaired';
        const status = await deps.repo.status();
        if (!status.ok) return 'failed';
        if (!status.value.connected) return 'not-connected';
        if (!deps.isOnline()) return 'offline';
        const now = deps.now();
        if (!options.force && lastAttempt !== null && now - lastAttempt < MIN_GAP_MS) return 'throttled';
        lastAttempt = now;
        return await run(code);
      } finally {
        busy = false;
      }
    },
  };
}
