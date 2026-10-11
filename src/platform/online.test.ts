import { describe, expect, it, vi } from 'vitest';
import { whenOnline } from './online';

describe('whenOnline', () => {
  it('runs immediately when online', () => {
    const run = vi.fn();
    const target = new EventTarget();
    whenOnline({ onLine: true }, target, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('waits for the online event when offline, then runs once', () => {
    const run = vi.fn();
    const target = new EventTarget();
    whenOnline({ onLine: false }, target, run);
    expect(run).not.toHaveBeenCalled();

    target.dispatchEvent(new Event('online'));
    target.dispatchEvent(new Event('online'));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
