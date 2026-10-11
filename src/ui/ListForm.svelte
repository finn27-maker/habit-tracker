<script lang="ts">
  import { untrack } from 'svelte';
  import { COLOR_NAMES, LIST_COLORS, type ListColor, type ListInput } from '../domain/lists';

  let {
    title,
    initial,
    error,
    onSubmit,
    onCancel,
  }: {
    title: string;
    initial: ListInput;
    error: string;
    onSubmit: (values: ListInput) => void;
    onCancel: () => void;
  } = $props();

  // The sheet edits its own copy and is created fresh each time it opens.
  let name = $state(untrack(() => initial.name));
  let emoji = $state(untrack(() => initial.emoji));
  let color = $state<ListColor>(untrack(() => initial.color));
</script>

<div class="backdrop">
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
    <h2>{title}</h2>
    <form
      onsubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, emoji, color });
      }}
    >
      <label for="list-name">Name</label>
      <input id="list-name" type="text" bind:value={name} autocomplete="off" />

      <label for="list-emoji">Emoji</label>
      <input
        id="list-emoji"
        type="text"
        bind:value={emoji}
        autocomplete="off"
        aria-describedby="list-emoji-hint"
      />
      <p id="list-emoji-hint" class="hint">Tap the emoji key on your keyboard.</p>

      <fieldset>
        <legend>Color</legend>
        <div class="swatches">
          {#each COLOR_NAMES as option (option)}
            <input
              type="radio"
              name="color"
              value={option}
              aria-label={option}
              bind:group={color}
              style:background={LIST_COLORS[option]}
            />
          {/each}
        </div>
      </fieldset>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <div class="buttons">
        <button type="button" class="secondary" onclick={onCancel}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 20; /* above the update toast (10) and the tab bar (5) */
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgb(0 0 0 / 0.4);
  }
  .sheet {
    width: 100%;
    max-width: 600px;
    max-height: 90%;
    overflow-y: auto;
    padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
    border-radius: 16px 16px 0 0;
    background: var(--surface);
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }
  label,
  legend {
    display: block;
    margin: 0.75rem 0 0.25rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  input[type='text'] {
    width: 100%;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--separator);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 1rem;
  }
  .hint {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  input[type='radio'] {
    appearance: none;
    width: 44px;
    height: 44px;
    margin: 0;
    border: 3px solid transparent;
    border-radius: 50%;
    background-clip: content-box;
    padding: 3px;
  }
  input[type='radio']:checked {
    border-color: var(--text);
  }
  .error {
    margin: 0.75rem 0 0;
    color: var(--danger);
    font-weight: 600;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  button {
    flex: 1;
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  button.secondary {
    background: var(--bg);
    color: var(--text);
  }
</style>
