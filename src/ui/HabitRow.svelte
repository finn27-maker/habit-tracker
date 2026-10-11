<script lang="ts">
  import type { DailyRow } from '../domain/today';

  let { row, onToggle }: { row: DailyRow; onToggle: () => void } = $props();

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
    <span class="title">{row.item.title}</span>
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
    gap: 0.5rem;
    min-height: 3.5rem;
    padding-right: 0.75rem;
  }
  .check {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0 0 0 0.75rem;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 1.0625rem;
    text-align: left;
  }
  .circle {
    flex: none;
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
  .title {
    min-width: 0;
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
