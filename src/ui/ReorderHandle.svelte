<script lang="ts">
  import { tick } from 'svelte';
  import type { RowDrag } from './row-drag.svelte';

  let {
    id,
    name,
    index,
    count,
    drag,
    onMove,
  }: {
    id: string;
    name: string;
    index: number;
    count: number;
    drag: RowDrag;
    /** Moves this row to place `to`. */
    onMove: (to: number) => unknown;
  } = $props();

  async function move(to: number) {
    await onMove(to);
    await tick();
    // Moving the row can drop focus; keep it on this handle so the next move is one tap away.
    document.querySelector<HTMLElement>(`[data-reorder="${CSS.escape(id)}"]`)?.focus();
  }

  /** Arrow keys on the handle move the row one place, for people not using touch. */
  function nudge(event: KeyboardEvent) {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const to = index + step;
    if (to >= 0 && to < count) void move(to);
  }
</script>

<button
  type="button"
  class="handle"
  aria-label="Reorder {name}"
  data-reorder={id}
  onpointerdown={(event) => drag.start(event, id, index)}
  onpointermove={(event) => drag.follow(event)}
  onpointerup={() => drag.end()}
  onpointercancel={() => drag.cancel()}
  onkeydown={nudge}
>
  ☰
</button>
<!-- VoiceOver can't drag: these stay invisible until focused, and then they're full size. -->
{#if index > 0}
  <button type="button" class="move sr-only" onclick={() => move(index - 1)}>Move {name} up</button>
{/if}
{#if index < count - 1}
  <button type="button" class="move sr-only" onclick={() => move(index + 1)}>Move {name} down</button>
{/if}

<style>
  .handle {
    flex: none;
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.25rem;
    cursor: grab;
    /* The handle's drag must move the row, not scroll the page. */
    touch-action: none;
  }
  /* Sized only when focused: until then the sr-only rule keeps it at 1px. */
  .move:focus {
    min-width: 44px;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 0;
    border-radius: 10px;
    background: var(--fill);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
</style>
