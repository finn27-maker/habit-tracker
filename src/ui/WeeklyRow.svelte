<script lang="ts">
  import type { WeeklyRow } from '../domain/today';
  import { itemHash } from './route';

  let { row, onLog, onUndo }: { row: WeeklyRow; onLog: () => void; onUndo: () => void } = $props();

  const RADIUS = 20;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const filled = $derived(Math.min(row.count / row.target, 1) * CIRCUMFERENCE);
  const ringLabel = $derived(
    `Log ${row.item.title}, ${row.count} of ${row.target} this week${row.met ? ', goal met' : ''}`,
  );
  const streakLabel = $derived(
    `${row.streak} week streak${row.streakAtRisk ? ', not met yet this week' : ''}`,
  );
</script>

<li class="row">
  <button type="button" class="ring" aria-label={ringLabel} onclick={onLog}>
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle class="track" cx="24" cy="24" r={RADIUS} />
      <circle
        class="progress"
        class:met={row.met}
        cx="24"
        cy="24"
        r={RADIUS}
        stroke-dasharray="{filled} {CIRCUMFERENCE}"
        transform="rotate(-90 24 24)"
      />
    </svg>
    <span class="count" aria-hidden="true">{row.count}/{row.target}</span>
  </button>

  <a
    class="name"
    href={itemHash(row.item.id)}
    aria-label="{row.item.title} details"
    aria-describedby={row.item.note ? `note-${row.item.id}` : undefined}
  >
    {row.item.title}
    {#if row.item.note}
      <span class="note" id="note-{row.item.id}">{row.item.note}</span>
    {/if}
  </a>

  {#if row.count > 0}
    <button
      type="button"
      class="minus"
      aria-label="Remove last {row.item.title} log"
      onclick={onUndo}
    >
      −
    </button>
  {/if}

  {#if row.streak > 0}
    <span class="streak" class:risk={row.streakAtRisk} role="img" aria-label={streakLabel}>
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
  .ring {
    position: relative;
    flex: none;
    width: 3rem;
    height: 3rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
  }
  svg {
    width: 100%;
    height: 100%;
  }
  circle {
    fill: none;
    stroke-width: 4;
  }
  .track {
    stroke: var(--separator);
  }
  .progress {
    stroke: var(--accent);
    stroke-linecap: round;
  }
  .progress.met {
    stroke: var(--success);
  }
  .count {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 0.6875rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .name {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    min-height: 3rem;
    padding: 0 0.5rem;
    color: var(--text);
    font-size: 1.0625rem;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .note {
    padding-bottom: 0.375rem;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    white-space: pre-line;
  }
  .minus {
    flex: none;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--accent);
    font-size: 1.5rem;
    line-height: 1;
  }
  .streak {
    flex: none;
    padding-left: 0.25rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .streak.risk {
    opacity: 0.55;
  }
</style>
