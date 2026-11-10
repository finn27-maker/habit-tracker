<script lang="ts">
  import { parseDayKey } from '../domain/dates';
  import { countLabel } from '../domain/history';
  import { MAX_DAY_LOGS } from '../domain/items';
  import Sheet from './Sheet.svelte';

  let {
    day,
    title,
    count,
    onAdd,
    onRemove,
    onDone,
  }: {
    /** YYYY-MM-DD of the day being changed. */
    day: string;
    /** The weekly goal's name. */
    title: string;
    /** Logs on that day; the sheet shows it live as + and − save. */
    count: number;
    onAdd: () => void;
    onRemove: () => void;
    onDone: () => void;
  } = $props();

  const dateName = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
</script>

<Sheet title={dateName.format(parseDayKey(day))}>
  <p class="goal">{title}</p>
  <div class="stepper">
    <button type="button" aria-label="Remove a log" disabled={count === 0} onclick={onRemove}>−</button>
    <output class="count" aria-live="polite">{countLabel(count, 'log')}</output>
    <button type="button" aria-label="Add a log" disabled={count >= MAX_DAY_LOGS} onclick={onAdd}>+</button>
  </div>
  <div class="buttons">
    <button type="button" class="done" onclick={onDone}>Done</button>
  </div>
</Sheet>

<style>
  .goal {
    margin: 0 0 1rem;
    color: var(--text-secondary);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    margin-bottom: 1.25rem;
  }
  .stepper button {
    width: 3rem;
    height: 3rem;
    border: 0;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font: inherit;
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
  }
  .stepper button:disabled {
    opacity: 0.4;
  }
  .count {
    min-width: 5rem;
    font-size: 1.25rem;
    font-weight: 700;
    text-align: center;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
  }
  .done {
    min-width: 44px;
    min-height: 44px;
    padding: 0 1.25rem;
    border: 0;
    border-radius: 10px;
    background: var(--fill);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
</style>
