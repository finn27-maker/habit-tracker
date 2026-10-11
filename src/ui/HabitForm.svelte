<script lang="ts">
  import { untrack } from 'svelte';
  import { MAX_TARGET, MIN_TARGET, type ItemType } from '../domain/items';
  import type { List } from '../domain/lists';
  import Sheet from './Sheet.svelte';

  type Values = { title: string; listId: string; type: ItemType; target: number };

  let {
    lists,
    initial,
    error,
    onSubmit,
    onCancel,
  }: {
    lists: readonly List[];
    /** When given, the sheet edits this item and its type cannot change. */
    initial?: Values;
    error: string;
    onSubmit: (values: Values) => void;
    onCancel: () => void;
  } = $props();

  // The sheet edits its own copy and is created fresh each time it opens.
  let title = $state(untrack(() => initial?.title ?? ''));
  let listId = $state(untrack(() => initial?.listId ?? lists[0]?.id ?? ''));
  let type = $state<ItemType>(untrack(() => initial?.type ?? 'daily'));
  let target = $state(untrack(() => initial?.target ?? 3));

  const editing = $derived(initial !== undefined);
  const targetChoices = Array.from({ length: MAX_TARGET - MIN_TARGET + 1 }, (_, i) => MIN_TARGET + i);
</script>

<Sheet title={editing ? 'Edit weekly goal' : 'New habit'}>
  {#if lists.length === 0}
    <p class="hint">Create a list in the Lists tab first, then come back to add a habit.</p>
    <div class="buttons">
      <button type="button" class="secondary" onclick={onCancel}>Close</button>
    </div>
  {:else}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        onSubmit({ title, listId, type, target });
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

      {#if !editing}
        <label for="habit-type">Repeats</label>
        <select id="habit-type" bind:value={type}>
          <option value="daily">Every day</option>
          <option value="weekly">Times a week</option>
        </select>
      {/if}

      {#if type === 'weekly'}
        <label for="habit-target">Times per week</label>
        <select id="habit-target" bind:value={target}>
          {#each targetChoices as choice (choice)}
            <option value={choice}>{choice}</option>
          {/each}
        </select>
      {/if}

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
