<script lang="ts">
  import type { TodoRow } from '../domain/today';

  let {
    row,
    onToggle,
    onEdit,
  }: { row: TodoRow; onToggle: () => void; onEdit: () => void } = $props();
</script>

<li class="row" class:done={row.done}>
  <button
    type="button"
    class="check"
    role="checkbox"
    aria-checked={row.done}
    aria-label={row.item.title}
    onclick={onToggle}
  >
    <span class="circle" class:done={row.done} aria-hidden="true">
      {#if row.done}✓{/if}
    </span>
  </button>
  <button type="button" class="name" aria-label="Edit {row.item.title}" onclick={onEdit}>
    {row.item.title}
  </button>
  {#if row.due}
    <span class="due" class:overdue={row.due.overdue}>{row.due.text}</span>
  {/if}
</li>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 3.5rem;
    padding: 0 0.75rem 0 0.5rem;
    transition: opacity 0.4s ease;
  }
  .row.done {
    opacity: 0.55;
  }
  .check {
    flex: none;
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    padding: 0;
    border: 0;
    background: transparent;
  }
  .circle {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 2px solid var(--text-secondary);
    border-radius: 50%;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
  }
  .circle.done {
    border-color: var(--accent);
    background: var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    min-height: 3rem;
    padding: 0 0.5rem;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 1.0625rem;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .done .name {
    text-decoration: line-through;
  }
  .due {
    flex: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .due.overdue {
    color: var(--danger);
  }
</style>
