<script lang="ts">
  import { untrack } from 'svelte';
  import { COLOR_NAMES, LIST_COLORS, type ListColor, type ListInput } from '../domain/lists';
  import Sheet from './Sheet.svelte';

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

<Sheet {title}>
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
</Sheet>

<style>
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
</style>
