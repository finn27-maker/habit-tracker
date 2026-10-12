<script lang="ts">
  import { onMount } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { dayKey } from '../domain/dates';
  import {
    deleteForeverQuestion,
    deletedRows,
    emptyQuestion,
    type ArchivedItem,
    type DeletedRow,
  } from '../domain/deleted';
  import type { Clock } from '../platform/clock';

  let {
    listsRepo,
    itemsRepo,
    clock,
  }: { listsRepo: ListsRepo; itemsRepo: ItemsRepo; clock: Clock } = $props();

  let rows = $state<DeletedRow[]>([]);
  let loaded = $state(false);
  let notice = $state('');
  /** What the open confirmation would delete for good: one item, or everything. */
  let confirming = $state<{ item: ArchivedItem } | 'all' | null>(null);

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

  async function deleteForGood() {
    const target = confirming;
    confirming = null;
    if (target === null) return;
    const result =
      target === 'all' ? await itemsRepo.emptyDeleted() : await itemsRepo.deleteForever(target.item.id);
    if (!result.ok) {
      notice = result.error;
      return;
    }
    await load(target === 'all' ? 'Emptied Recently deleted.' : `Deleted “${target.item.title}” for good.`);
  }

  onMount(() => void load());
</script>

<header class="bar">
  <div class="top">
    <a class="back" href="#/lists"><span aria-hidden="true">‹ </span>Lists</a>
    {#if rows.length > 0}
      <button type="button" class="empty-all" onclick={() => (confirming = 'all')}>Empty</button>
    {/if}
  </div>
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
        <button
          type="button"
          class="danger"
          aria-label="Delete {row.item.title}"
          onclick={() => (confirming = { item: row.item })}
        >
          Delete
        </button>
      </li>
    {/each}
  </ul>
{:else if loaded}
  <p class="empty">Nothing deleted.</p>
{/if}

{#if confirming !== null}
  <div class="backdrop">
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="forever-title">
      <p id="forever-title">
        {confirming === 'all' ? emptyQuestion(rows.length) : deleteForeverQuestion(confirming.item.title)}
      </p>
      <div class="buttons">
        <button type="button" class="secondary" onclick={() => (confirming = null)}>Cancel</button>
        <button type="button" class="destructive" onclick={deleteForGood}>
          {confirming === 'all' ? 'Delete all' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bar {
    padding: 0.5rem 0 1rem;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    gap: 0.25rem;
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
    min-width: 44px;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
  }
  .row .danger,
  .empty-all {
    color: var(--danger);
  }
  .empty {
    margin-top: 2rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-secondary);
    text-align: center;
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
    overflow-wrap: anywhere;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  .buttons button {
    flex: 1;
    border-radius: 10px;
  }
  .secondary {
    background: var(--bg);
    color: var(--text);
  }
  .destructive {
    background: var(--danger-fill);
    color: #fff;
  }
</style>
