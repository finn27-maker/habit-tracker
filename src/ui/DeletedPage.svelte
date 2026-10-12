<script lang="ts">
  import { onMount } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { dayKey } from '../domain/dates';
  import { deletedRows, type ArchivedItem, type DeletedRow } from '../domain/deleted';
  import type { Clock } from '../platform/clock';

  let {
    listsRepo,
    itemsRepo,
    clock,
  }: { listsRepo: ListsRepo; itemsRepo: ItemsRepo; clock: Clock } = $props();

  let rows = $state<DeletedRow[]>([]);
  let loaded = $state(false);
  let notice = $state('');

  /** Shows what is deleted in storage now; `message` replaces any earlier notice. */
  async function load(message = '') {
    const [lists, archived] = await Promise.all([listsRepo.getAll(), itemsRepo.listArchived()]);
    if (!lists.ok) {
      notice = lists.error;
    } else if (!archived.ok) {
      notice = archived.error;
    } else {
      rows = deletedRows(archived.value, lists.value, dayKey(clock.now()));
      loaded = true;
      notice = message;
    }
  }

  async function restore(item: ArchivedItem) {
    const result = await itemsRepo.restore(item.id);
    if (!result.ok) {
      notice = result.error;
      return;
    }
    const { movedTo } = result.value;
    await load(
      movedTo
        ? `Restored “${item.title}” to ${movedTo} because its list was deleted.`
        : `Restored “${item.title}”.`,
    );
  }

  onMount(() => void load());
</script>

<header class="bar">
  <a class="back" href="#/lists"><span aria-hidden="true">‹ </span>Lists</a>
  <h1>Recently deleted</h1>
</header>

{#if notice}
  <p class="notice" role="status">{notice}</p>
{/if}

{#if rows.length > 0}
  <ul class="rows">
    {#each rows as row (row.item.id)}
      <li class="row">
        <div class="text">
          <span class="name">{row.item.title}</span>
          <span class="detail">{row.detail}</span>
        </div>
        <button type="button" aria-label="Restore {row.item.title}" onclick={() => restore(row.item)}>
          Restore
        </button>
      </li>
    {/each}
  </ul>
{:else if loaded}
  <p class="empty">Nothing deleted.</p>
{/if}

<style>
  .bar {
    padding: 0.5rem 0 1rem;
  }
  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }
  h1 {
    margin: 0;
    font-size: 2.125rem;
    font-weight: 700;
  }
  .notice {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    font-weight: 600;
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0.5rem 0.75rem;
  }
  .row + .row {
    border-top: 1px solid var(--separator);
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .name {
    font-size: 1.0625rem;
  }
  .detail {
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }
  button {
    flex: none;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
  }
  .empty {
    margin-top: 2rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-secondary);
    text-align: center;
  }
</style>
