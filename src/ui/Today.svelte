<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { buildToday } from '../domain/today';
  import type { Clock } from '../platform/clock';
  import { Board } from './board.svelte';
  import BoardSheet from './BoardSheet.svelte';
  import ItemRows from './ItemRows.svelte';

  let {
    listsRepo,
    itemsRepo,
    clock,
    lingerMs,
  }: { listsRepo: ListsRepo; itemsRepo: ItemsRepo; clock: Clock; lingerMs?: number } = $props();

  const board = untrack(() => new Board({ listsRepo, itemsRepo, clock, lingerMs }));

  const groups = $derived(
    buildToday({
      lists: board.lists,
      items: board.items,
      completionDays: board.days,
      targets: board.targets,
      today: board.today,
      lingering: board.lingering,
    }),
  );
  const dateLabel = $derived(
    board.now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  );

  onMount(() => board.mount());
</script>

<header class="bar">
  <div>
    <p class="date">{dateLabel}</p>
    <h1>Today</h1>
  </div>
  <button
    type="button"
    class="add"
    aria-label="New habit"
    onclick={() => board.openForm({ kind: 'new' })}
  >
    +
  </button>
</header>

{#if board.notice}
  <p class="notice" role="status">{board.notice}</p>
{/if}

{#each groups as group (group.list.id)}
  <section class="group" aria-labelledby="group-{group.list.id}">
    <h2 id="group-{group.list.id}">
      <span class="icon" aria-hidden="true">{group.list.emoji}</span>
      <span class="name">{group.list.name}</span>
    </h2>
    <ItemRows rows={group.rows} {board} />
  </section>
{:else}
  {#if board.loaded}
    <section class="empty">
      <p>Nothing here yet. Tap + to add your first habit or to-do.</p>
    </section>
  {/if}
{/each}

<BoardSheet {board} />

<style>
  .bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0.5rem 0 1rem;
  }
  .date {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  h1 {
    margin: 0.125rem 0 0;
    font-size: 2.125rem;
    font-weight: 700;
  }
  .add {
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
  .group {
    margin-bottom: 1.25rem;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin: 0 0 0.375rem 0.25rem;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .empty {
    margin-top: 3rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-secondary);
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
</style>
