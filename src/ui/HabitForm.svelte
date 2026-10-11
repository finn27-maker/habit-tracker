<script lang="ts">
  import { untrack } from 'svelte';
  import type { List } from '../domain/lists';
  import Sheet from './Sheet.svelte';

  let {
    lists,
    error,
    onSubmit,
    onCancel,
  }: {
    lists: readonly List[];
    error: string;
    onSubmit: (values: { title: string; listId: string }) => void;
    onCancel: () => void;
  } = $props();

  let title = $state('');
  // Starts on the first list; the sheet is created fresh each time it opens.
  let listId = $state(untrack(() => lists[0]?.id ?? ''));
</script>

<Sheet title="New habit">
  {#if lists.length === 0}
    <p class="hint">Create a list in the Lists tab first, then come back to add a habit.</p>
    <div class="buttons">
      <button type="button" class="secondary" onclick={onCancel}>Close</button>
    </div>
  {:else}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        onSubmit({ title, listId });
      }}
    >
      <label for="habit-title">Name</label>
      <input id="habit-title" type="text" bind:value={title} autocomplete="off" />

      <label for="habit-list">List</label>
      <select id="habit-list" bind:value={listId}>
        {#each lists as list (list.id)}
          <option value={list.id}>{list.emoji} {list.name}</option>
        {/each}
      </select>
      <p class="hint">Repeats every day.</p>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <div class="buttons">
        <button type="button" class="secondary" onclick={onCancel}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  {/if}
</Sheet>
