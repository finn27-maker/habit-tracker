<script lang="ts">
  import type { DeviceKind } from '../platform/install';
  import type { InstallHint } from './install-hint.svelte';

  let { hint }: { hint: InstallHint } = $props();

  const STEPS: Record<DeviceKind, string> = {
    ios: 'Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen.',
    android: 'Add to Home screen to keep your data safe. Tap ⋮, then Add to Home screen.',
    other:
      "Install this app to keep your data safe. Use your browser's Install or Add to Home Screen option.",
  };
</script>

{#if hint.visible}
  <section class="banner" aria-label="Install this app">
    <p class="title">{STEPS[hint.device]}</p>
    <p class="detail">
      Your data in a browser tab is separate from the installed app, and the browser may clear it
      after 7 days.
    </p>
    <div class="buttons">
      <button type="button" class="later" onclick={() => hint.dismiss()}>Got it</button>
      {#if hint.canInstall}
        <button type="button" onclick={() => hint.install()}>Install</button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .banner {
    margin: 0.5rem 0 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--text);
  }
  .title {
    margin: 0;
    font-weight: 600;
  }
  .detail {
    margin: 0.25rem 0 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  button {
    min-height: 44px;
    padding: 0 1rem;
    border: 0;
    border-radius: 10px;
    background: var(--fill);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  .later {
    background: transparent;
    color: var(--accent);
  }
</style>
