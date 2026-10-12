<script lang="ts">
  import { heatLevel } from '../domain/history';

  let {
    weeks,
    counts,
    today,
    label,
    binary = false,
  }: {
    /** Sunday-first columns of day keys. */
    weeks: readonly (readonly string[])[];
    counts: ReadonlyMap<string, number>;
    today: string;
    label: string;
    /** Daily habits are done or not: a done day gets the full shade. */
    binary?: boolean;
  } = $props();

  const level = (count: number) => (binary ? (count > 0 ? 3 : 0) : heatLevel(count));
</script>

<!-- One labelled image: 182 squares are too small to tap, and the calendar does the editing. -->
<div class="heatmap" role="img" aria-label={label}>
  {#each weeks as week, w (w)}
    <div class="week">
      {#each week as day (day)}
        <span
          class="cell"
          class:future={day > today}
          data-day={day}
          data-level={day > today ? undefined : level(counts.get(day) ?? 0)}
        ></span>
      {/each}
    </div>
  {/each}
</div>

<style>
  .heatmap {
    display: grid;
    grid-template-columns: repeat(26, 1fr);
    gap: 2px;
    margin-top: 1.25rem;
    padding: 0.75rem;
    border-radius: 12px;
    background: var(--surface);
  }
  .week {
    display: grid;
    grid-template-rows: repeat(7, 1fr);
    gap: 2px;
  }
  .cell {
    aspect-ratio: 1;
    border-radius: 2px;
    background: var(--separator);
  }
  .cell[data-level='1'] {
    background: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .cell[data-level='2'] {
    background: color-mix(in srgb, var(--accent) 75%, transparent);
  }
  .cell[data-level='3'] {
    background: var(--accent);
  }
  .cell.future {
    background: transparent;
  }
</style>
