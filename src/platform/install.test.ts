import { describe, expect, it, vi } from 'vitest';
import { deviceKind, isStandalone, requestPersistenceOnce } from './install';

const media = (matches: boolean) => () => ({ matches });

describe('deviceKind', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/148 Mobile';
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148';

  it('tells iPhone, iPad, Android and computers apart', () => {
    expect(deviceKind(IPHONE, 5)).toBe('ios');
    expect(deviceKind(IPAD, 5)).toBe('ios'); // iPadOS Safari reports a Mac
    expect(deviceKind(IPAD, 0)).toBe('other'); // a real Mac
    expect(deviceKind(IPAD)).toBe('other');
    expect(deviceKind(ANDROID, 5)).toBe('android');
    expect(deviceKind(WINDOWS, 0)).toBe('other');
  });
});

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
