<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { isStandalone } from './platform/install';
  import InstallBanner from './ui/InstallBanner.svelte';
  import Today from './ui/Today.svelte';
  import UpdateToast from './ui/UpdateToast.svelte';

  const { needRefresh, updateServiceWorker } = useRegisterSW();

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
  onReload={() => updateServiceWorker(true)}
  onDismiss={() => needRefresh.set(false)}
/>
