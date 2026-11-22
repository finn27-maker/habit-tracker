<script lang="ts">
  import { onMount } from 'svelte';
  import type { AssistantRepo, AssistantStatus } from '../data/assistant-repo';
  import { normalizeCode } from '../domain/assistant';
  import type { SyncResult } from '../platform/assistant-sync';
  import type { Push, PushState } from '../platform/push';
  import Sheet from './Sheet.svelte';

  let {
    repo,
    runSync,
    push,
    onClose,
  }: {
    repo: AssistantRepo;
    /** Syncs now; `true` skips the once-a-minute limit. */
    runSync: (force?: boolean) => Promise<SyncResult>;
    /** Notifications (s30); offered only once the phone is paired and connected. */
    push?: Push;
    onClose: () => void;
  } = $props();

  const NOTIFY_FAILED = "Couldn't turn on notifications. Check your connection and try again.";
  let pushState = $state<PushState | null>(null);
  let pushError = $state('');
  let pushBusy = $state(false);

  async function refreshPush() {
    if (push) pushState = await push.state();
  }

  async function turnOn() {
    if (!push) return;
    pushError = '';
    pushBusy = true;
    const result = await push.enable();
    if (result === 'failed') pushError = NOTIFY_FAILED;
    await refreshPush();
    if (result === 'not-connected') await refresh();
    pushBusy = false;
  }

  async function turnOff() {
    if (!push) return;
    pushError = '';
    pushBusy = true;
    await push.disable();
    await refreshPush();
    pushBusy = false;
  }

  const BAD_CODE = "That doesn't look like a pairing code. Copy it again from your assistant.";
  const NOT_CONNECTED = 'Not connected. Get a new code from your assistant and paste it here.';

  let status = $state<AssistantStatus | null>(null);
  let code = $state('');
  let error = $state('');
  let busy = $state(false);
  const showNotifications = $derived(push !== undefined && status?.paired === true && status.connected);

  const statusText = $derived(
    status === null
      ? ''
      : !status.paired
        ? 'Not paired'
        : status.connected
          ? 'Connected to your assistant'
          : NOT_CONNECTED,
  );
  const lastSynced = $derived(
    status?.lastSyncAt == null
      ? ''
      : new Date(status.lastSyncAt).toLocaleString([], {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        }),
  );

  async function refresh() {
    const result = await repo.status();
    if (result.ok) status = result.value;
    else error = result.error;
  }

  onMount(() => {
    void refresh();
    void refreshPush();
  });

  async function pair(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    const normalized = normalizeCode(code);
    if (normalized === null) {
      error = BAD_CODE;
      return;
    }
    busy = true;
    const saved = await repo.pair(normalized);
    if (saved.ok) {
      code = '';
      await runSync(true);
      await refresh();
    } else {
      error = saved.error;
    }
    busy = false;
  }

  async function remove() {
    error = '';
    // Tell the assistant to stop first, while the code that proves who we are still exists.
    if (pushState?.on) await turnOff();
    const result = await repo.unpair();
    if (!result.ok) error = result.error;
    await refresh();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<Sheet title="Assistant">
  <p class="status" role="status">{statusText}</p>
  {#if lastSynced}
    <p class="hint">Last synced {lastSynced}</p>
  {/if}

  <form onsubmit={pair}>
    <label for="assistant-code">Pairing code</label>
    <input
      id="assistant-code"
      bind:value={code}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
    />
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <button type="submit" class="primary" disabled={busy}>Pair</button>
  </form>

  {#if status?.paired}
    <button type="button" class="secondary" onclick={remove}>Remove</button>
  {/if}

  {#if showNotifications && pushState}
    <section aria-labelledby="notifications-title">
      <h3 id="notifications-title">Notifications</h3>
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
        <button type="button" class="secondary" disabled={pushBusy} onclick={turnOff}>Turn off notifications</button>
      {:else}
        <button type="button" class="primary" disabled={pushBusy} onclick={turnOn}>Turn on notifications</button>
      {/if}
      {#if pushError}
        <p class="error" role="alert">{pushError}</p>
      {/if}
    </section>
  {/if}

  <p class="hint">
    New to-dos from your assistant arrive each time you open Habit Tracker. Nothing from your
    lists is ever sent, except that with notifications on, the dates to-dos are due are sent,
    never their names.
  </p>
  <button type="button" class="secondary" onclick={onClose}>Close</button>
</Sheet>

<style>
  .status {
    margin: 0 0 0.5rem;
    font-weight: 600;
  }
  .hint {
    margin: 0.5rem 0;
    color: var(--text-secondary);
    font-size: 0.9375rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  label {
    font-weight: 600;
  }
  input {
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--separator);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
  }
  .error {
    margin: 0;
    color: var(--danger);
  }
  section {
    margin: 1.25rem 0 0.5rem;
  }
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1.0625rem;
  }
  button {
    width: 100%;
    min-height: 44px;
    margin-top: 0.5rem;
    border: 0;
    border-radius: 10px;
    font: inherit;
    font-weight: 600;
  }
  .primary {
    background: var(--fill);
    color: #fff;
  }
  .secondary {
    background: var(--bg);
    color: var(--accent);
  }
  button:disabled {
    opacity: 0.6;
  }
</style>
