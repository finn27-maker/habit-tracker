export interface StandaloneEnv {
  /** iOS Safari sets navigator.standalone when launched from the Home Screen. */
  navigatorStandalone?: boolean;
  matchMedia?: (query: string) => { matches: boolean };
}

export function isStandalone(env: StandaloneEnv): boolean {
  if (env.navigatorStandalone === true) return true;
  return env.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

export type PersistenceResult = 'granted' | 'denied' | 'unsupported' | 'already-requested';

export interface PersistenceDeps {
  storage: { persist?: () => Promise<boolean> } | undefined;
  hasRequested: () => boolean;
  markRequested: () => void;
}

/**
 * Asks the browser not to evict our IndexedDB data. iOS treats this as best-effort,
 * so the JSON backup (S7) remains the real safety net.
 */
export async function requestPersistenceOnce(deps: PersistenceDeps): Promise<PersistenceResult> {
  if (deps.hasRequested()) return 'already-requested';
  const persist = deps.storage?.persist;
  if (!persist) return 'unsupported';

  deps.markRequested();
  try {
    return (await persist.call(deps.storage)) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
