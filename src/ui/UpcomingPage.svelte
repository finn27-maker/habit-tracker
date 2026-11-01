<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { buildUpcoming } from '../domain/today';
  import type { Clock } from '../platform/clock';
  import { Board } from './board.svelte';
  import BoardSheet from './BoardSheet.svelte';
  import TodoRow from './TodoRow.svelte';

  let {
    listsRepo,
    itemsRepo,
    clock,
    lingerMs,
  }: { listsRepo: ListsRepo; itemsRepo: ItemsRepo; clock: Clock; lingerMs?: number } = $props();

  const board = untrack(() => new Board({ listsRepo, itemsRepo, clock, lingerMs }));

  const sections = $derived(
    buildUpcoming({
      lists: board.lists,
      items: board.items,
      completionDays: board.days,
      targets: board.targets,
      today: board.today,
      lingering: board.lingering,
    }),
  );

  onMount(() => board.mount());
</script>

<header class="bar">
  <h1>Upcoming</h1>
  <button
    type="button"
    class="add"
    aria-label="Add"
    onclick={() => board.openForm({ kind: 'new' })}
  >
    +
  </button>
</header>

{#if board.notice}
  <p class="notice" role="status">{board.notice}</p>
{/if}

{#each sections as section (section.key)}
  <section class="group" aria-labelledby="upcoming-{section.key}">
    <h2 id="upcoming-{section.key}" class:overdue={section.key === 'overdue'}>{section.title}</h2>
    <ul class="rows">
      {#each section.rows as row (row.item.id)}
        <TodoRow
          {row}
          list={row.list}
          onToggle={() => board.toggleTodo(row.item.id)}
          onEdit={() => board.openForm({ kind: 'edit', row })}
        />
      {/each}
    </ul>
  </section>
{:else}
  {#if board.loaded}
    <section class="empty">
      <p>Nothing coming up. Tap + to add a to-do.</p>
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
  h1 {
    margin: 1.25rem 0 0;
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
    margin: 0 0 0.375rem 0.25rem;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-secondary);
  }
  h2.overdue {
    color: var(--danger);
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  .rows :global(li + li) {
    border-top: 1px solid var(--separator);
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
