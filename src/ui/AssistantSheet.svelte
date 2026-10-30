<script lang="ts">
  import { onMount } from 'svelte';
  import type { AssistantRepo, AssistantStatus } from '../data/assistant-repo';
  import { normalizeCode } from '../domain/assistant';
  import type { SyncResult } from '../platform/assistant-sync';
  import Sheet from './Sheet.svelte';

  let {
    repo,
    runSync,
    onClose,
  }: {
    repo: AssistantRepo;
    /** Syncs now; `true` skips the once-a-minute limit. */
    runSync: (force?: boolean) => Promise<SyncResult>;
    onClose: () => void;
  } = $props();

  const BAD_CODE = "That doesn't look like a pairing code. Copy it again from your assistant.";
  const NOT_CONNECTED = 'Not connected. Get a new code from your assistant and paste it here.';

  let status = $state<AssistantStatus | null>(null);
  let code = $state('');
  let error = $state('');
  let busy = $state(false);

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

  onMount(refresh);

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

  <p class="hint">
    New to-dos from your assistant arrive each time you open Habit Tracker. Nothing from your
    lists is ever sent.
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
