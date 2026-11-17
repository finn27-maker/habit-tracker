<script lang="ts">
  import { backupDateLabel } from '../domain/backup';
  import { addBackButton, canAddBack, restoreListLabel } from '../domain/restore';
  import { restoreMessage, type BackupState } from './backup.svelte';

  let { backup }: { backup: BackupState } = $props();

  let picker: HTMLInputElement | undefined = $state();

  async function picked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // choosing the same file again should still work
    if (file) await backup.choose(file);
  }
</script>

<section class="backup" aria-labelledby="backup-title">
  <h2 id="backup-title">Backup</h2>
  <p class="last">
    Last backup: {backup.lastBackupAt === null ? 'Never' : backupDateLabel(backup.lastBackupAt)}
  </p>
  {#if backup.notice}
    <p class="notice" role="status">{backup.notice}</p>
  {/if}
  <div class="actions">
    <button
      type="button"
      disabled={!backup.file || backup.restoring}
      onpointerdown={() => backup.refresh()}
      onclick={() => backup.export()}
    >
      Export backup
    </button>
    <button
      type="button"
      class="secondary"
      disabled={backup.restoring}
      onclick={() => picker?.click()}
    >
      Restore from file
    </button>
  </div>
  <input
    bind:this={picker}
    class="picker"
    type="file"
    accept=".json,application/json"
    tabindex="-1"
    aria-hidden="true"
    onchange={picked}
  />
</section>

{#if backup.pending?.step === 'pick'}
  {@const pending = backup.pending}
  {@const button = addBackButton(pending.plan, backup.picked)}
  <div class="backdrop">
    <div class="confirm pick" role="dialog" aria-modal="true" aria-labelledby="pick-title">
      <h3 id="pick-title">Restore from backup ({backupDateLabel(Date.parse(pending.backup.exportedAt))})</h3>
      <p class="hint">Tick lists to add back what's missing from this phone. Nothing on the phone changes.</p>
      <ul class="picks">
        {#each pending.plan as list (list.id)}
          <li>
            <label class:muted={!canAddBack(list)}>
              <input
                type="checkbox"
                checked={backup.picked.includes(list.id)}
                disabled={!canAddBack(list)}
                onchange={() => backup.togglePick(list.id)}
              />
              <span class="list-name"><span aria-hidden="true">{list.emoji}</span> {list.name}</span>
              <span class="what">{restoreListLabel(list)}</span>
            </label>
          </li>
        {/each}
      </ul>
      <div class="buttons stacked">
        <button type="button" disabled={!button.enabled} onclick={() => backup.confirmAddBack()}>
          {button.text}
        </button>
        <button type="button" class="secondary" onclick={() => backup.showReplace()}>
          Replace everything instead
        </button>
        <button type="button" class="secondary" onclick={() => backup.cancelRestore()}>Cancel</button>
      </div>
    </div>
  </div>
{:else if backup.pending}
  {@const pending = backup.pending}
  <div class="backdrop">
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="restore-title">
      <p id="restore-title">{restoreMessage(pending)}</p>
      <div class="buttons">
        <button type="button" class="secondary" onclick={() => backup.cancelRestore()}>Cancel</button>
        <button type="button" class="destructive" onclick={() => backup.confirmRestore()}>Replace</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backup {
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
  .last {
    margin: 0.375rem 0 0.75rem;
  }
  .notice {
    margin: 0 0 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    font-weight: 600;
  }
  .actions {
    display: grid;
    gap: 0.5rem;
  }
  button {
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
  .picker {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .backdrop {
    position: fixed;
    z-index: 20; /* above the update toast (10) and the tab bar (5) */
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.4);
  }
  .confirm {
    width: 100%;
    max-width: 360px;
    padding: 1.25rem;
    border-radius: 14px;
    background: var(--surface);
  }
  .confirm p {
    margin: 0 0 1rem;
    font-weight: 600;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  .buttons button {
    flex: 1;
  }
  .destructive {
    background: var(--danger-fill);
  }
  .pick {
    max-height: 85vh;
    overflow-y: auto;
  }
  .pick h3 {
    margin: 0 0 0.375rem;
    font-size: 1.0625rem;
    overflow-wrap: anywhere;
  }
  .hint {
    margin: 0 0 0.75rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  .picks {
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
  }
  .picks li + li {
    border-top: 1px solid var(--separator);
  }
  .picks label {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    column-gap: 0.625rem;
    min-height: 44px;
    padding: 0.375rem 0;
  }
  .picks input {
    grid-row: span 2;
    width: 1.375rem;
    height: 1.375rem;
    margin: 0;
  }
  .list-name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .what {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  .muted .list-name {
    color: var(--text-secondary);
  }
  .stacked {
    flex-direction: column;
  }
</style>
