<script lang="ts">
  import type { DailyRow } from '../domain/today';

  let {
    row,
    onToggle,
    onEdit,
  }: { row: DailyRow; onToggle: () => void; onEdit: () => void } = $props();

  const streakLabel = $derived(`${row.streak} day streak${row.atRisk ? ', not done today' : ''}`);
</script>

<li class="row">
  <button
    type="button"
    class="check"
    role="checkbox"
    aria-checked={row.doneToday}
    aria-label={row.item.title}
    onclick={onToggle}
  >
    <span class="circle" class:done={row.doneToday} aria-hidden="true">
      {#if row.doneToday}✓{/if}
    </span>
  </button>
  <button type="button" class="name" aria-label="Edit {row.item.title}" onclick={onEdit}>
    {row.item.title}
  </button>
  {#if row.streak > 0}
    <span class="streak" class:risk={row.atRisk} role="img" aria-label={streakLabel}>
      🔥 {row.streak}
    </span>
  {/if}
</li>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 3.5rem;
    padding: 0 0.75rem 0 0.5rem;
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
  .streak {
    flex: none;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .streak.risk {
    opacity: 0.55;
  }
</style>
