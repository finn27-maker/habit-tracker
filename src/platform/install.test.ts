import { describe, expect, it, vi } from 'vitest';
import { isStandalone, requestPersistenceOnce } from './install';

const media = (matches: boolean) => () => ({ matches });

describe('isStandalone', () => {
  it('is true when iOS reports navigator.standalone', () => {
    expect(isStandalone({ navigatorStandalone: true, matchMedia: media(false) })).toBe(true);
  });

  it('is true when display-mode is standalone (Android/desktop installs)', () => {
    expect(isStandalone({ navigatorStandalone: undefined, matchMedia: media(true) })).toBe(true);
  });

  it('is false in a Safari tab', () => {
    expect(isStandalone({ navigatorStandalone: false, matchMedia: media(false) })).toBe(false);
  });

  it('is false when matchMedia is unavailable', () => {
    expect(isStandalone({})).toBe(false);
  });
});

describe('requestPersistenceOnce', () => {
  const flagStore = (initial = false) => {
    let requested = initial;
    return {
      hasRequested: () => requested,
      markRequested: vi.fn(() => {
        requested = true;
      }),
    };
  };

  it('calls navigator.storage.persist() on first run and records it', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const flags = flagStore();
    await expect(requestPersistenceOnce({ storage: { persist }, ...flags })).resolves.toBe('granted');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(flags.markRequested).toHaveBeenCalledTimes(1);
  });

  it('calls persist() exactly once across repeated launches', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const flags = flagStore();
    await requestPersistenceOnce({ storage: { persist }, ...flags });
    await expect(requestPersistenceOnce({ storage: { persist }, ...flags })).resolves.toBe(
      'already-requested',
    );
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('reports denied when the browser declines (iOS is best-effort)', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    await expect(requestPersistenceOnce({ storage: { persist }, ...flagStore() })).resolves.toBe(
      'denied',
    );
  });

  it('reports unsupported without throwing when the Storage API is missing', async () => {
    const flags = flagStore();
    await expect(requestPersistenceOnce({ storage: undefined, ...flags })).resolves.toBe(
      'unsupported',
    );
    expect(flags.markRequested).not.toHaveBeenCalled();
  });

  it('reports denied when persist() rejects', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(requestPersistenceOnce({ storage: { persist }, ...flagStore() })).resolves.toBe(
      'denied',
    );
  });
});
