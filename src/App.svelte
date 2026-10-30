<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { registerSW } from 'virtual:pwa-register';
  import { createAssistantRepo } from './data/assistant-repo';
  import { createBackupRepo } from './data/backup-repo';
  import { createDb } from './data/db';
  import { createItemsRepo } from './data/items-repo';
  import { createListsRepo } from './data/lists-repo';
  import { createAssistantSync, type SyncResult } from './platform/assistant-sync';
  import { createClock } from './platform/clock';
  import { deviceKind, isStandalone, type InstallPrompt } from './platform/install';
  import { whenOnline } from './platform/online';
  import type { ShareEnv } from './platform/share';
  import { InstallHint } from './ui/install-hint.svelte';
  import Router from './ui/Router.svelte';
  import UpdateToast from './ui/UpdateToast.svelte';

  const needRefresh = writable(false);
  const offlineReady = writable(false);
  let updateServiceWorker: (reload?: boolean) => Promise<void> = async () => {};

  // Registering fetches sw.js to check for updates. Offline, that request triggers
  // iOS's Airplane Mode alert, and the already-installed worker serves the app anyway.
  // Register immediately (not on load) so a first precache isn't cut short.
  whenOnline(navigator, window, () => {
    updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh: () => needRefresh.set(true),
      onOfflineReady: () => offlineReady.set(true),
    });
  });

  const INSTALL_DISMISSED = 'habit-tracker:install-hint-dismissed';
  const installHint = new InstallHint({
    standalone: isStandalone({
      navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
      matchMedia: (q) => window.matchMedia(q),
    }),
    device: deviceKind(navigator.userAgent, navigator.maxTouchPoints),
    isDismissed: () => localStorage.getItem(INSTALL_DISMISSED) === '1',
    markDismissed: () => localStorage.setItem(INSTALL_DISMISSED, '1'),
    // Chrome only: keep its install prompt for the card's Install button.
    onPrompt: (callback) =>
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        callback(event as unknown as InstallPrompt);
      }),
    onInstalled: (callback) => window.addEventListener('appinstalled', callback),
  });

  // The app's own address (no #route), for Share this app.
  const appUrl = new URL(import.meta.env.BASE_URL, location.href).href;

  const db = createDb();
  const listsRepo = createListsRepo(db);
  const itemsRepo = createItemsRepo(db);
  const backupRepo = createBackupRepo(db);

  // The share sheet where the browser has one; otherwise (or if it refuses) a download.
  const share: ShareEnv = {
    canShare: 'canShare' in navigator ? (data) => navigator.canShare(data) : undefined,
    share: 'share' in navigator ? (data) => navigator.share(data) : undefined,
    copyText: navigator.clipboard ? (text) => navigator.clipboard.writeText(text) : undefined,
    download: (file) => {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };

  /** Every signal that the app came back to the foreground. */
  function onResume(fn: () => void) {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fn();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', fn);
    window.addEventListener('focus', fn);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', fn);
      window.removeEventListener('focus', fn);
    };
  }

  // iOS may suspend the app across midnight with no reliable resume event, so "today"
  // is rechecked on every signal we can get plus a 30-second safety interval.
  const clock = createClock({
    now: () => new Date(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
    onResume,
  });

  // To-dos from the owner's assistant. An unpaired install (every family copy) returns before
  // any request (decision 7ac92147). Runs after Today is on screen and on each return to the app.
  const assistantRepo = createAssistantRepo(db);
  const assistantSync = createAssistantSync({
    repo: assistantRepo,
    fetch: (url, init) => window.fetch(url, init),
    isOnline: () => navigator.onLine,
    now: Date.now,
  });
  let revision = $state(0);

  async function runSync(force = false): Promise<SyncResult> {
    const result = await assistantSync.sync({ force });
    if (typeof result === 'object' && result.received > 0) revision++;
    return result;
  }

  onMount(() => {
    void runSync();
    return onResume(() => void runSync());
  });

</script>

<Router
  {listsRepo}
  {itemsRepo}
  {backupRepo}
  {share}
  {clock}
  {installHint}
  {appUrl}
  {assistantRepo}
  {runSync}
  {revision}
/>

<UpdateToast
  needRefresh={$needRefresh}
  offlineReady={$offlineReady}
  onReload={() => updateServiceWorker(true)}
  onDismiss={() => {
    needRefresh.set(false);
    offlineReady.set(false);
  }}
/>
