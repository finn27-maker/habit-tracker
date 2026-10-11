<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { isStandalone } from './platform/install';
  import InstallBanner from './ui/InstallBanner.svelte';
  import Today from './ui/Today.svelte';
  import UpdateToast from './ui/UpdateToast.svelte';

  // Register right away rather than on window load: iOS discards a half-finished
  // precache if the Home Screen app is closed before it completes.
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({ immediate: true });

  const standalone = isStandalone({
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    matchMedia: (q) => window.matchMedia(q),
  });
</script>

<main>
  <InstallBanner {standalone} />
  <Today now={new Date()} />
</main>

<UpdateToast
  needRefresh={$needRefresh}
  offlineReady={$offlineReady}
  onReload={() => updateServiceWorker(true)}
  onDismiss={() => {
    needRefresh.set(false);
    offlineReady.set(false);
  }}
/>
