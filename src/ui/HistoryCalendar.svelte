<script lang="ts">
  import { untrack } from 'svelte';
  import { parseDayKey } from '../domain/dates';
  import { monthGrid, monthLabel, shiftMonth, type Month } from '../domain/history';

  let {
    kind,
    counts,
    today,
    onPick,
  }: {
    kind: 'daily' | 'weekly';
    /** Logs per day. */
    counts: ReadonlyMap<string, number>;
    today: string;
    onPick: (day: string) => void;
  } = $props();

  const monthOf = (day: string): Month => ({
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)) - 1,
  });
  const index = ({ year, month }: Month) => year * 12 + month;

  let shown = $state<Month>(untrack(() => monthOf(today)));
  const atLatest = $derived(index(shown) >= index(monthOf(today)));
  const cells = $derived(monthGrid(shown.year, shown.month).flat());

  const dayName = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

  function label(day: string): string {
    const name = dayName.format(parseDayKey(day));
    if (day > today) return name;
    const count = counts.get(day) ?? 0;
    if (kind === 'daily') return `${name}, ${count > 0 ? 'done' : 'not done'}`;
    return `${name}, ${count} ${count === 1 ? 'log' : 'logs'}`;
  }
</script>

<section class="calendar" aria-labelledby="calendar-title">
  <div class="head">
    <button type="button" aria-label="Previous month" onclick={() => (shown = shiftMonth(shown, -1))}>
      ‹
    </button>
    <h2 id="calendar-title">{monthLabel(shown)}</h2>
    <button
      type="button"
      aria-label="Next month"
      disabled={atLatest}
      onclick={() => (shown = shiftMonth(shown, 1))}
    >
      ›
    </button>
  </div>

  <div class="grid">
    {#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as letter, i (i)}
      <span class="weekday" aria-hidden="true">{letter}</span>
    {/each}
    {#each cells as day, i (i)}
      {#if day}
        {@const count = counts.get(day) ?? 0}
        <button
          type="button"
          class="day"
          class:done={count > 0}
          class:today={day === today}
          aria-label={label(day)}
          aria-pressed={day > today ? undefined : count > 0}
          disabled={day > today}
          onclick={() => onPick(day)}
        >
          {Number(day.slice(8))}
          {#if kind === 'weekly' && count > 1}<span class="count" aria-hidden="true">×{count}</span>{/if}
        </button>
      {:else}
        <span></span>
      {/if}
    {/each}
  </div>
</section>

<style>
  .calendar {
    margin-top: 1.25rem;
    padding: 0.75rem;
    border-radius: 12px;
    background: var(--surface);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .head button {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 1.5rem;
  }
  .head button:disabled {
    color: var(--text-secondary);
    opacity: 0.4;
  }
  h2 {
    margin: 0;
    font-size: 1.0625rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.25rem;
    margin-top: 0.25rem;
  }
  .weekday {
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }
  .day {
    position: relative;
    min-width: 40px;
    min-height: 40px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
  .day.done {
    background: var(--fill);
    color: #fff;
    font-weight: 700;
  }
  .day.today {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .day:disabled {
    color: var(--text-secondary);
    opacity: 0.4;
  }
  .count {
    position: absolute;
    right: 0;
    bottom: 0;
    font-size: 0.625rem;
  }
</style>
