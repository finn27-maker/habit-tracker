<script lang="ts">
  import { writable } from 'svelte/store';
  import { registerSW } from 'virtual:pwa-register';
  import { createDb } from './data/db';
  import { createListsRepo } from './data/lists-repo';
  import { isStandalone } from './platform/install';
  import { whenOnline } from './platform/online';
  import InstallBanner from './ui/InstallBanner.svelte';
  import Lists from './ui/Lists.svelte';
  import { routeFromHash } from './ui/route';
  import TabBar from './ui/TabBar.svelte';
  import Today from './ui/Today.svelte';
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

  const listsRepo = createListsRepo(createDb());
  let route = $state(routeFromHash(location.hash));
</script>

<svelte:window onhashchange={() => (route = routeFromHash(location.hash))} />

<main>
  <InstallBanner {standalone} />
  {#if route === 'lists'}
    <Lists repo={listsRepo} />
  {:else}
    <Today now={new Date()} />
  {/if}
</main>

<TabBar current={route} />

<UpdateToast
  needRefresh={$needRefresh}
  offlineReady={$offlineReady}
  onReload={() => updateServiceWorker(true)}
  onDismiss={() => {
    needRefresh.set(false);
    offlineReady.set(false);
  }}
/>
