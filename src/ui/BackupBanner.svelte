<script lang="ts">
  import type { BackupState } from './backup.svelte';

  let { backup }: { backup: BackupState } = $props();
</script>

{#if backup.reminder !== 'none'}
  <aside class="banner" aria-label="Backup reminder">
    <p>
      {backup.reminder === 'never'
        ? "You haven't backed up yet."
        : "It's been over 30 days since your last backup."}
    </p>
    <div class="buttons">
      <button type="button" class="later" onclick={() => backup.snooze()}>Not now</button>
      <button type="button" disabled={!backup.file} onclick={() => backup.export()}>Back up now</button>
    </div>
  </aside>
{/if}

<style>
  .banner {
    margin: 0.5rem 0 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
  }
  p {
    margin: 0 0 0.5rem;
    font-weight: 600;
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
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  button:disabled {
    opacity: 0.5;
  }
  .later {
    background: transparent;
    color: var(--accent);
  }
</style>
