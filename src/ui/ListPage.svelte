<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { buildListView } from '../domain/today';
  import type { Clock } from '../platform/clock';
  import { Board } from './board.svelte';
  import BoardSheet from './BoardSheet.svelte';
  import ItemRows from './ItemRows.svelte';

  let {
    listId,
    listsRepo,
    itemsRepo,
    clock,
    lingerMs,
  }: {
    listId: string;
    listsRepo: ListsRepo;
    itemsRepo: ItemsRepo;
    clock: Clock;
    lingerMs?: number;
  } = $props();

  const board = untrack(() => new Board({ listsRepo, itemsRepo, clock, lingerMs }));
  let showCompleted = $state(false);

  const list = $derived(board.lists.find((candidate) => candidate.id === listId));
  const view = $derived(
    list
      ? buildListView({
          list,
          items: board.items,
          completionDays: board.days,
          targets: board.targets,
          today: board.today,
          lingering: board.lingering,
        })
      : null,
  );

  onMount(() => board.mount());
</script>

<header class="bar">
  <a class="back" href="#/lists"><span aria-hidden="true">‹ </span>Lists</a>
  {#if list}
    <div class="title">
      <h1><span aria-hidden="true">{list.emoji}</span> {list.name}</h1>
      <button
        type="button"
        class="add"
        aria-label="New habit"
        onclick={() => board.openForm({ kind: 'new', listId })}
      >
        +
      </button>
    </div>
  {/if}
</header>

{#if board.notice}
  <p class="notice" role="status">{board.notice}</p>
{/if}

{#if board.loaded && !list}
  <p class="empty">List not found</p>
{:else if view}
  {#if view.rows.length > 0}
    <ItemRows rows={view.rows} {board} />
  {:else if view.completed.length === 0}
    <p class="empty">Nothing in this list yet. Tap + to add something.</p>
  {/if}

  {#if view.completed.length > 0}
    <button
      type="button"
      class="toggle"
      aria-expanded={showCompleted}
      onclick={() => (showCompleted = !showCompleted)}
    >
      Completed ({view.completed.length})
    </button>
    {#if showCompleted}
      <ItemRows rows={view.completed} {board} />
    {/if}
  {/if}
{/if}

<BoardSheet {board} />

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
  .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h1 {
    margin: 0;
    font-size: 2.125rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .add {
    flex: none;
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1;
  }
  .notice {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
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
  .toggle {
    min-height: 44px;
    margin: 1rem 0 0.375rem;
    padding: 0 0.25rem;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 700;
  }
</style>
