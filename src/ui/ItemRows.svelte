<script lang="ts">
  import type { TodayRow } from '../domain/today';
  import type { Board } from './board.svelte';
  import HabitRow from './HabitRow.svelte';
  import TodoRow from './TodoRow.svelte';
  import WeeklyRow from './WeeklyRow.svelte';

  let { rows, board }: { rows: readonly TodayRow[]; board: Board } = $props();
</script>

<ul class="rows">
  {#each rows as row (row.item.id)}
    {#if row.kind === 'daily'}
      <HabitRow {row} onToggle={() => board.toggle(row.item.id)} />
    {:else if row.kind === 'weekly'}
      <WeeklyRow
        {row}
        onLog={() => board.logWeekly(row.item.id)}
        onUndo={() => board.undoWeekly(row.item.id)}
      />
    {:else}
      <TodoRow
        {row}
        onToggle={() => board.toggleTodo(row.item.id)}
        onEdit={() => board.openForm({ kind: 'edit', row })}
      />
    {/if}
  {/each}
</ul>

<style>
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  /* Each row is its own component, so the divider is drawn from here. */
  .rows :global(li + li) {
    border-top: 1px solid var(--separator);
  }
</style>
