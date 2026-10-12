<script lang="ts">
  import { writable } from 'svelte/store';
  import { registerSW } from 'virtual:pwa-register';
  import { createBackupRepo } from './data/backup-repo';
  import { createDb } from './data/db';
  import { createItemsRepo } from './data/items-repo';
  import { createListsRepo } from './data/lists-repo';
  import { createClock } from './platform/clock';
  import { isStandalone } from './platform/install';
  import { whenOnline } from './platform/online';
  import type { ShareEnv } from './platform/share';
  import InstallBanner from './ui/InstallBanner.svelte';
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

  const standalone = isStandalone({
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    matchMedia: (q) => window.matchMedia(q),
  });

  const db = createDb();
  const listsRepo = createListsRepo(db);
  const itemsRepo = createItemsRepo(db);
  const backupRepo = createBackupRepo(db);

  // The share sheet where the browser has one; otherwise (or if it refuses) a download.
  const share: ShareEnv = {
    canShare: 'canShare' in navigator ? (data) => navigator.canShare(data) : undefined,
    share: 'share' in navigator ? (data) => navigator.share(data) : undefined,
    download: (file) => {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };

  // iOS may suspend the app across midnight with no reliable resume event, so "today"
  // is rechecked on every signal we can get plus a 30-second safety interval.
  const clock = createClock({
    now: () => new Date(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
    onResume: (fn) => {
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
    },
  });

</script>

<Router {listsRepo} {itemsRepo} {backupRepo} {share} {clock}>
  <InstallBanner {standalone} />
</Router>

<UpdateToast
  needRefresh={$needRefresh}
  offlineReady={$offlineReady}
  onReload={() => updateServiceWorker(true)}
  onDismiss={() => {
    needRefresh.set(false);
    offlineReady.set(false);
  }}
/>
