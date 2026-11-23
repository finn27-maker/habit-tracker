<script lang="ts">
  import { onMount } from 'svelte';
  import type { AssistantRepo } from '../data/assistant-repo';
  import type { Push, PushState } from '../platform/push';

  // Notifications on the Lists tab (s31; s30 for the texts). Shown only on a paired, connected
  // phone: deciding that reads the phone's own storage, so family installs never contact anyone.
  let { repo, push }: { repo: AssistantRepo; push: Push } = $props();

  const NOTIFY_FAILED = "Couldn't turn on notifications. Check your connection and try again.";

  let connected = $state(false);
  let pushState = $state<PushState | null>(null);
  let error = $state('');
  let busy = $state(false);

  async function refresh() {
    const status = await repo.status();
    connected = status.ok && status.value.paired && status.value.connected;
    if (connected) pushState = await push.state();
  }

  onMount(refresh);

  async function turnOn() {
    error = '';
    busy = true;
    const result = await push.enable();
    if (result === 'failed') error = NOTIFY_FAILED;
    await refresh();
    busy = false;
  }

  async function turnOff() {
    error = '';
    busy = true;
    await push.disable();
    await refresh();
    busy = false;
  }
</script>

{#if connected && pushState}
  <section class="notifications" aria-labelledby="notifications-title">
    <h2 id="notifications-title">Notifications</h2>
    {#if pushState.support === 'needs-home-screen'}
      <p class="hint">To get notifications, open this app from your Home Screen.</p>
    {:else if pushState.support === 'unsupported'}
      <p class="hint">This browser can't show notifications.</p>
    {:else if pushState.permission === 'denied'}
      <p class="hint">
        Notifications are blocked. Turn them on in Settings, Notifications, under this app's Home
        Screen name.
      </p>
    {:else if pushState.on}
      <p class="hint">On: new to-dos from your assistant, and a 7:00 am summary when something is due.</p>
      <button type="button" class="secondary" disabled={busy} onclick={turnOff}>Turn off notifications</button>
    {:else}
      <p class="hint">New to-dos from your assistant, and a 7:00 am summary when something is due.</p>
      <button type="button" disabled={busy} onclick={turnOn}>Turn on notifications</button>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </section>
{/if}

<style>
  .notifications {
    margin-top: 2rem;
    padding: 1rem;
    border-radius: 12px;
    background: var(--surface);
  }
  h2 {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .hint {
    margin: 0.375rem 0 0.75rem;
  }
  .error {
    margin: 0.75rem 0 0;
    color: var(--danger);
  }
  button {
    width: 100%;
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    background: var(--fill);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  button:disabled {
    opacity: 0.5;
  }
  .secondary {
    background: var(--bg);
    color: var(--text);
  }
</style>
