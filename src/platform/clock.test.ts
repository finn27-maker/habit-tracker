import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_DELAY_MS, SAFETY_CHECK_MS, createClock, type ClockEnv } from './clock';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function makeEnv() {
  const resumeListeners = new Set<() => void>();
  const delays: number[] = [];
  const env: ClockEnv = {
    now: () => new Date(),
    setTimeout: (fn, ms) => {
      delays.push(ms);
      return setTimeout(fn, ms);
    },
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    onResume: (fn) => {
      resumeListeners.add(fn);
      return () => resumeListeners.delete(fn);
    },
  };
  return { env, delays, resumeListeners, resume: () => resumeListeners.forEach((fn) => fn()) };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 14, 23, 59, 50) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createClock', () => {
  it('reports the environment time', () => {
    const { env } = makeEnv();
    expect(createClock(env).now()).toEqual(new Date(2026, 9, 14, 23, 59, 50));
  });

  it('reports a new day exactly at local midnight', () => {
    const { env, delays } = makeEnv();
    const onChange = vi.fn();
    createClock(env).watch(onChange);
    expect(delays).toEqual([10_000]);

    vi.advanceTimersByTime(9_999);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 15, 0, 0, 0));
  });

  it('keeps reporting each following day', () => {
    const { env } = makeEnv();
    const onChange = vi.fn();
    createClock(env).watch(onChange);

    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(24 * HOUR);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 9, 16, 0, 0, 0));
  });

  it('reports a new day when the app returns to the foreground', () => {
    const { env, resume } = makeEnv();
    const onChange = vi.fn();
    createClock(env).watch(onChange);

    resume(); // same day: nothing to report
    expect(onChange).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(2026, 9, 15, 7, 0));
    resume();
    resume(); // already reported
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 15, 7, 0));
  });

  it('catches a new day with the interval when no resume event fires', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0));
    const { env } = makeEnv();
    const onChange = vi.fn();
    createClock(env).watch(onChange);

    vi.setSystemTime(new Date(2026, 9, 15, 7, 0)); // the phone slept through midnight
    vi.advanceTimersByTime(SAFETY_CHECK_MS - 1);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('never schedules a timer shorter than the minimum delay', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 23, 59, 59, 800));
    const { env, delays } = makeEnv();
    const onChange = vi.fn();
    createClock(env).watch(onChange);

    expect(delays).toEqual([MIN_DELAY_MS]);
    vi.advanceTimersByTime(MIN_DELAY_MS - 1);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not report or loop when the browser fires the timer early', () => {
    const { env, delays } = makeEnv();
    const early: ClockEnv = {
      ...env,
      // A timer that fires 200 ms before it was due.
      setTimeout: (fn, ms) => {
        delays.push(ms);
        return setTimeout(fn, ms - 200);
      },
    };
    const onChange = vi.fn();
    createClock(early).watch(onChange);

    vi.advanceTimersByTime(9_800); // fires at 23:59:59.800, still the same day
    expect(onChange).not.toHaveBeenCalled();
    expect(delays).toEqual([10_000, MIN_DELAY_MS]); // re-armed, not a tight loop

    vi.advanceTimersByTime(MIN_DELAY_MS - 200); // the re-armed timer, also early, passes midnight
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops every timer and listener when the watch is stopped', () => {
    const { env, resumeListeners, resume } = makeEnv();
    const onChange = vi.fn();
    const stop = createClock(env).watch(onChange);
    expect(vi.getTimerCount()).toBe(2);
    expect(resumeListeners.size).toBe(1);

    stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(resumeListeners.size).toBe(0);

    vi.advanceTimersByTime(72 * HOUR);
    resume();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not reschedule when stopped from inside the change callback', () => {
    const { env } = makeEnv();
    let stop = () => {};
    stop = createClock(env).watch(() => stop());

    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('follows the local calendar over the 23-hour spring-forward day', () => {
    vi.setSystemTime(new Date(2026, 2, 7, 23, 0));
    const { env } = makeEnv();
    const onChange = vi.fn();
    createClock(env).watch(onChange);

    vi.advanceTimersByTime(HOUR);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 2, 8, 0, 0));
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(22 * HOUR + 59 * MINUTE);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MINUTE);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 2, 9, 0, 0));
  });

  it('follows the local calendar over the 25-hour fall-back day', () => {
    vi.setSystemTime(new Date(2026, 9, 31, 23, 0));
    const { env } = makeEnv();
    const onChange = vi.fn();
    createClock(env).watch(onChange);

    vi.advanceTimersByTime(HOUR);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 1, 0, 0));

    vi.advanceTimersByTime(24 * HOUR + 59 * MINUTE);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MINUTE);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 2, 0, 0));
  });
});
