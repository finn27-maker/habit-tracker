<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { buildListView } from '../domain/today';
  import type { Clock } from '../platform/clock';
  import { Board } from './board.svelte';
  import BoardSheet from './BoardSheet.svelte';
  import ItemRows from './ItemRows.svelte';
  import ReorderHandle from './ReorderHandle.svelte';
  import { RowDrag } from './row-drag.svelte';

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
  let editing = $state(false);
  let confirmingClear = $state(false);

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

  /** The habits and goals, in their saved order: what Edit mode reorders. */
  const recurring = $derived(view ? view.rows.filter((row) => row.kind !== 'todo').map((row) => row.item) : []);
  const drag = new RowDrag(
    () => recurring.length,
    (id, to) => board.moveItem(id, to),
  );

  const clearMessage = (count: number) =>
    `Clear ${count} completed ${count === 1 ? 'to-do' : 'to-dos'}? You can restore them from Recently deleted.`;

  async function clear() {
    confirmingClear = false;
    await board.clearCompleted(listId);
  }

  onMount(() => board.mount());
</script>

<header class="bar">
  <a class="back" href="#/lists"><span aria-hidden="true">‹ </span>Lists</a>
  {#if list}
    <div class="title">
      <h1><span aria-hidden="true">{list.emoji}</span> {list.name}</h1>
      <div class="actions">
        {#if editing || recurring.length > 1}
          <button type="button" class="text" onclick={() => (editing = !editing)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        {/if}
        <button
          type="button"
          class="add"
          aria-label="New habit"
          onclick={() => board.openForm({ kind: 'new', listId })}
        >
          +
        </button>
      </div>
    </div>
  {/if}
</header>

{#if board.notice}
  <p class="notice" role="status">{board.notice}</p>
{/if}

{#if board.loaded && !list}
  <p class="empty">List not found</p>
{:else if view && editing}
  <ul class="reorder">
    {#each recurring as item, index (item.id)}
      <li
        class="reorder-row"
        class:dragging={drag.isDragging(item.id)}
        class:settling={drag.isMakingRoom(item.id)}
        style:transform={drag.shift(index)}
      >
        <span class="reorder-name">{item.title}</span>
        <ReorderHandle
          id={item.id}
          name={item.title}
          {index}
          count={recurring.length}
          {drag}
          onMove={(to) => board.moveItem(item.id, to)}
        />
      </li>
    {/each}
  </ul>
  <p class="hint">Drag ☰ to put habits and goals in order. To-dos follow their due dates.</p>
{:else if view}
  {#if view.rows.length > 0}
    <ItemRows rows={view.rows} {board} />
  {:else if view.completed.length === 0}
    <p class="empty">Nothing in this list yet. Tap + to add something.</p>
  {/if}

  {#if view.completed.length > 0}
    <div class="completed-bar">
      <button
        type="button"
        class="toggle"
        aria-expanded={showCompleted}
        onclick={() => (showCompleted = !showCompleted)}
      >
        Completed ({view.completed.length})
      </button>
      <button type="button" class="clear" onclick={() => (confirmingClear = true)}>
        Clear completed
      </button>
    </div>
    {#if showCompleted}
      <ItemRows rows={view.completed} {board} />
    {/if}
  {/if}

  {#if confirmingClear}
    <div class="backdrop">
      <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="clear-title">
        <p id="clear-title">{clearMessage(view.completed.length)}</p>
        <div class="buttons">
          <button type="button" class="secondary" onclick={() => (confirmingClear = false)}>Cancel</button>
          <button type="button" class="destructive" onclick={clear}>Clear</button>
        </div>
      </div>
    </div>
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
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .text {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
  }
  .completed-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 1rem 0 0.375rem;
  }
  .toggle,
  .clear {
    min-height: 44px;
    padding: 0 0.25rem;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 700;
  }
  .toggle {
    color: var(--text-secondary);
  }
  .clear {
    color: var(--accent);
  }
  .reorder {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  .reorder-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3.5rem;
    padding: 0.25rem 0.5rem 0.25rem 1rem;
    background: var(--surface);
  }
  .reorder-row + .reorder-row {
    border-top: 1px solid var(--separator);
  }
  .reorder-row.dragging {
    position: relative;
    z-index: 1;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
  }
  .reorder-row.settling {
    transition: transform 0.15s ease;
  }
  .reorder-name {
    flex: 1;
    min-width: 0;
    font-size: 1.0625rem;
    overflow-wrap: anywhere;
  }
  .hint {
    margin: 0.75rem 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
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
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  .buttons .secondary {
    background: var(--bg);
    color: var(--text);
  }
  .buttons .destructive {
    background: var(--danger-fill);
  }
</style>
