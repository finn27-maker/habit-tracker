import type { AssistantRepo } from '../data/assistant-repo';
import type { NotifyRepo } from '../data/notify-repo';
import { PUSH_DUE_DAYS_URL, PUSH_KEY_URL, PUSH_SUBSCRIPTION_URL } from '../domain/assistant';
import { dueDays } from '../domain/notify';
import type { FetchLike } from './assistant-sync';

/** The browser's push subscription, as much of it as the server needs. */
export interface SubscriptionLike {
  toJSON(): { endpoint?: string; keys?: Record<string, string> };
  unsubscribe(): Promise<boolean>;
}

/** The browser pieces notifications need, injected so tests can stand in for them. */
export interface PushEnv {
  /** PushManager, Notification and a service worker all exist (iOS: only from the Home Screen). */
  hasPush: boolean;
  isIos: boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  subscribe(applicationServerKey: Uint8Array<ArrayBuffer>): Promise<SubscriptionLike>;
  currentSubscription(): Promise<SubscriptionLike | null>;
  timeZone(): string;
}

export type PushSupport = 'supported' | 'needs-home-screen' | 'unsupported';

export interface PushState {
  support: PushSupport;
  permission: NotificationPermission;
  on: boolean;
}

export type EnableResult = 'on' | 'blocked' | 'failed' | 'not-connected';
export type DueDaysResult = 'sent' | 'unchanged' | 'skipped' | 'failed' | 'not-connected';

export interface PushDeps {
  env: PushEnv;
  notify: NotifyRepo;
  assistant: AssistantRepo;
  fetch: FetchLike;
  isOnline: () => boolean;
  timeoutMs?: number;
}

export interface Push {
  state(): Promise<PushState>;
  /** Asks permission (from a tap), registers this phone with the assistant and sends its due days. */
  enable(): Promise<EnableResult>;
  /** Stops pushes on the phone, then tells the assistant (best effort: a dead address is dropped there). */
  disable(): Promise<void>;
  /** Sends the due days if notifications are on and they changed since the last send. */
  syncDueDays(options?: { keepalive?: boolean }): Promise<DueDaysResult>;
  /**
   * On app start: sends this phone's push address again, since the assistant drops one the push
   * service reports gone, and turns off if the phone's Settings no longer allow notifications.
   */
  reregister(): Promise<'sent' | 'skipped' | 'off' | 'failed' | 'not-connected'>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

class Unauthorized extends Error {}

/** base64url (as the server sends the VAPID key) to bytes. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Notifications (s30, decision 1d64a633). Only a paired, connected phone ever calls the
 * assistant; what leaves the phone is its push address, its time zone and the days open
 * to-dos are due - never a title.
 */
export function createPush(deps: PushDeps): Push {
  const { env, notify, assistant } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(url: string, code: string, method: string, body?: unknown, keepalive = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await deps.fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${code}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit',
        cache: 'no-store',
        keepalive,
        signal: controller.signal,
      });
      if (response.status === 401) throw new Unauthorized();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.status === 204 ? null : await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** The code when this phone may talk to the assistant, else null. */
  async function connectedCode() {
    const code = await assistant.code();
    if (code === null) return null;
    const status = await assistant.status();
    return status.ok && status.value.connected ? code : null;
  }

  function support(): PushSupport {
    if (env.hasPush) return 'supported';
    return env.isIos ? 'needs-home-screen' : 'unsupported';
  }

  async function sendDueDays(code: string, keepalive: boolean): Promise<DueDaysResult> {
    const todos = await notify.todos();
    if (!todos.ok) return 'failed';
    const body = { days: dueDays(todos.value), timeZone: env.timeZone() };
    const value = JSON.stringify(body);
    const sent = await notify.sent();
    if (sent.ok && sent.value === value) return 'unchanged';
    await call(PUSH_DUE_DAYS_URL, code, 'PUT', body, keepalive);
    await notify.markSent(value);
    return 'sent';
  }

  /** The phone's subscription (made if missing) sent to the assistant. */
  async function register(code: string) {
    let subscription = await env.currentSubscription();
    if (subscription === null) {
      const { publicKey } = (await call(PUSH_KEY_URL, code, 'GET')) as { publicKey?: unknown };
      if (typeof publicKey !== 'string') return false;
      subscription = await env.subscribe(keyBytes(publicKey));
    }
    const { endpoint, keys } = subscription.toJSON();
    await call(PUSH_SUBSCRIPTION_URL, code, 'PUT', { endpoint, keys, timeZone: env.timeZone() });
    return true;
  }

  async function guarded<T>(run: () => Promise<T>, failed: T, notConnected: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof Unauthorized)) return failed;
      await assistant.markNotConnected();
      return notConnected;
    }
  }

  return {
    async state() {
      const on = await notify.isOn();
      return {
        support: support(),
        permission: env.hasPush ? env.permission() : 'default',
        on: on.ok && on.value,
      };
    },

    async enable() {
      const code = await connectedCode();
      if (code === null) return 'not-connected';
      if (!env.hasPush || !deps.isOnline()) return 'failed';
      const permission = await env.requestPermission();
      if (permission !== 'granted') return 'blocked';
      return guarded<EnableResult>(
        async () => {
          if (!(await register(code))) return 'failed';
          const saved = await notify.setOn(true);
          if (!saved.ok) return 'failed';
          await notify.markSent('');
          try {
            await sendDueDays(code, false);
          } catch (error) {
            // Notifications are on; the days go with the next open or resume.
            if (error instanceof Unauthorized) throw error;
          }
          return 'on';
        },
        'failed',
        'not-connected',
      );
    },

    async disable() {
      try {
        await (await env.currentSubscription())?.unsubscribe();
      } catch {
        // The address is dropped by the assistant when the push service reports it gone.
      }
      await notify.setOn(false);
      const code = await assistant.code();
      if (code === null || !deps.isOnline()) return;
      await guarded(() => call(PUSH_SUBSCRIPTION_URL, code, 'DELETE'), null, null);
    },

    async syncDueDays(options = {}) {
      const on = await notify.isOn();
      if (!on.ok || !on.value) return 'skipped';
      const code = await connectedCode();
      if (code === null || !deps.isOnline()) return 'skipped';
      return guarded(() => sendDueDays(code, options.keepalive ?? false), 'failed', 'not-connected');
    },

    async reregister() {
      const on = await notify.isOn();
      if (!on.ok || !on.value) return 'skipped';
      if (!env.hasPush || env.permission() !== 'granted') {
        await notify.setOn(false);
        return 'off';
      }
      const code = await connectedCode();
      if (code === null || !deps.isOnline()) return 'skipped';
      return guarded<'sent' | 'failed' | 'not-connected'>(
        async () => ((await register(code)) ? 'sent' : 'failed'),
        'failed',
        'not-connected',
      );
    },
  };
}
