import { dayKey, nextLocalMidnight } from '../domain/dates';

/** The browser pieces the clock needs, injectable so tests can control time. */
export interface ClockEnv {
  now(): Date;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  /** Subscribes to "the app is visible again" signals; returns an unsubscribe function. */
  onResume(fn: () => void): () => void;
}

export interface Clock {
  now(): Date;
  /** Calls `onChange` whenever the local calendar day changes. Returns a stop function. */
  watch(onChange: (now: Date) => void): () => void;
}

/** iOS can suspend a Home Screen app across midnight without any resume event. */
export const SAFETY_CHECK_MS = 30_000;
/** Never re-arm sooner than this, so a timer that fires early can't spin. */
export const MIN_DELAY_MS = 1_000;

export function createClock(env: ClockEnv): Clock {
  return {
    now: () => env.now(),

    watch(onChange) {
      let stopped = false;
      let lastDay = dayKey(env.now());
      let midnightTimer: unknown;

      const check = () => {
        const now = env.now();
        const day = dayKey(now);
        if (day === lastDay) return;
        lastDay = day;
        onChange(now);
      };

      const armMidnight = () => {
        const now = env.now();
        const delay = Math.max(nextLocalMidnight(now).getTime() - now.getTime(), MIN_DELAY_MS);
        midnightTimer = env.setTimeout(() => {
          check();
          if (!stopped) armMidnight();
        }, delay);
      };

      armMidnight();
      const interval = env.setInterval(check, SAFETY_CHECK_MS);
      const stopResume = env.onResume(check);

      return () => {
        stopped = true;
        env.clearTimeout(midnightTimer);
        env.clearInterval(interval);
        stopResume();
      };
    },
  };
}
