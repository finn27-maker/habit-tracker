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
    onDelete,
  }: {
    lists: readonly List[];
    /** When given, the sheet edits this item and its type cannot change. */
    initial?: Values;
    error: string;
    onSubmit: (values: Values) => void;
    onCancel: () => void;
    /** Shown only when editing. Archives the item after the user confirms. */
    onDelete?: () => void;
  } = $props();

  // The sheet edits its own copy and is created fresh each time it opens.
  let title = $state(untrack(() => initial?.title ?? ''));
  let listId = $state(untrack(() => initial?.listId ?? lists[0]?.id ?? ''));
  let type = $state<ItemType>(untrack(() => initial?.type ?? 'daily'));
  let target = $state(untrack(() => initial?.target ?? 3));
  let confirmingDelete = $state(false);

  const editing = $derived(initial !== undefined);
  const sheetTitle = $derived(
    !initial ? 'New habit' : initial.type === 'weekly' ? 'Edit weekly goal' : 'Edit habit',
  );
  const targetChoices = Array.from({ length: MAX_TARGET - MIN_TARGET + 1 }, (_, i) => MIN_TARGET + i);
</script>

<Sheet title={sheetTitle}>
  {#if lists.length === 0}
    <p class="hint">Create a list in the Lists tab first, then come back to add a habit.</p>
    <div class="buttons">
      <button type="button" class="secondary" onclick={onCancel}>Close</button>
    </div>
  {:else if confirmingDelete}
    <p class="confirm">Delete "{initial?.title}"? Its history is kept, but it leaves Today.</p>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <div class="buttons">
      <button type="button" class="secondary" onclick={() => (confirmingDelete = false)}>
        Cancel
      </button>
      <button type="button" class="danger" onclick={onDelete}>Delete</button>
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

      {#if editing && onDelete}
        <button type="button" class="delete" onclick={() => (confirmingDelete = true)}>
          Delete
        </button>
      {/if}
    </form>
  {/if}
</Sheet>

<style>
  .confirm {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .buttons .danger {
    background: var(--danger);
  }
  .delete {
    width: 100%;
    min-height: 44px;
    margin-top: 0.75rem;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--danger);
    font: inherit;
    font-weight: 600;
  }
</style>
