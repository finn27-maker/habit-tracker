<script lang="ts">
  import { untrack } from 'svelte';
  import { addDaysToKey } from '../domain/dates';
  import { ITEM_KINDS, MAX_TARGET, MIN_TARGET, kindTitle, type ItemType } from '../domain/items';
  import type { List } from '../domain/lists';
  import type { FormValues } from './board.svelte';
  import Sheet from './Sheet.svelte';

  type Due = 'none' | 'today' | 'tomorrow' | 'pick';

  let {
    lists,
    today,
    initial,
    listId: startListId,
    error,
    onSubmit,
    onCancel,
    onDelete,
  }: {
    lists: readonly List[];
    /** Local YYYY-MM-DD, for the Today/Tomorrow due choices. */
    today: string;
    /** When given, the sheet edits this item and its type cannot change. */
    initial?: FormValues;
    /** The list a new item starts in (defaults to the first list). */
    listId?: string;
    error: string;
    onSubmit: (values: FormValues) => void;
    onCancel: () => void;
    /** Shown only when editing. Archives the item after the user confirms. */
    onDelete?: () => void;
  } = $props();

  function dueChoice(dueDate: string): Due {
    if (dueDate === '') return 'none';
    if (dueDate === today) return 'today';
    if (dueDate === addDaysToKey(today, 1)) return 'tomorrow';
    return 'pick';
  }

  // The sheet edits its own copy and is created fresh each time it opens.
  let title = $state(untrack(() => initial?.title ?? ''));
  let listId = $state(untrack(() => initial?.listId ?? startListId ?? lists[0]?.id ?? ''));
  // A new item starts with no type: the sheet asks first, so nothing defaults to a daily habit.
  let type = $state<ItemType | null>(untrack(() => initial?.type ?? null));
  let target = $state(untrack(() => initial?.target ?? 3));
  // New to-dos start due today; an edit keeps whatever date the to-do already has.
  let due = $state<Due>(untrack(() => (initial ? dueChoice(initial.dueDate) : 'today')));
  // "Pick a date" never shows an empty field: an existing date, or two days from now.
  let date = $state(untrack(() => (due === 'pick' ? initial!.dueDate : addDaysToKey(today, 2))));
  let localError = $state('');
  let confirmingDelete = $state(false);

  const editing = $derived(initial !== undefined);
  const sheetTitle = $derived.by(() => {
    if (!initial) return type === null ? 'What are you adding?' : `New ${kindTitle(type).toLowerCase()}`;
    if (initial.type === 'weekly') return 'Edit weekly goal';
    return initial.type === 'todo' ? 'Edit to-do' : 'Edit habit';
  });
  const targetChoices = Array.from({ length: MAX_TARGET - MIN_TARGET + 1 }, (_, i) => MIN_TARGET + i);

  function dueDate(): string | null {
    if (due === 'none') return '';
    if (due === 'today') return today;
    if (due === 'tomorrow') return addDaysToKey(today, 1);
    return date === '' ? null : date; // the field was cleared, or held no real date
  }

  function submit() {
    const chosen = type === 'todo' ? dueDate() : '';
    if (chosen === null) {
      localError = 'Pick a valid date';
      return;
    }
    localError = '';
    onSubmit({ title, listId, type: type!, target, dueDate: chosen });
  }
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
  {:else if type === null}
    <div class="kinds">
      {#each ITEM_KINDS as kind (kind.type)}
        <button
          type="button"
          class="kind"
          aria-label={kind.title}
          aria-describedby="kind-{kind.type}"
          onclick={() => (type = kind.type)}
        >
          <span class="kind-title">{kind.title}</span>
          <span class="kind-description" id="kind-{kind.type}">{kind.description}</span>
        </button>
      {/each}
    </div>
    <div class="buttons">
      <button type="button" class="secondary" onclick={onCancel}>Cancel</button>
    </div>
  {:else}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {#if !editing}
        <button type="button" class="back" onclick={() => (type = null)}>
          <span aria-hidden="true">‹ </span>Back
        </button>
      {/if}
      <label for="habit-title">Name</label>
      <input id="habit-title" type="text" bind:value={title} autocomplete="off" />

      <label for="habit-list">List</label>
      <select id="habit-list" bind:value={listId}>
        {#each lists as list (list.id)}
          <option value={list.id}>{list.emoji} {list.name}</option>
        {/each}
      </select>

      {#if type === 'weekly'}
        <label for="habit-target">Times per week</label>
        <select id="habit-target" bind:value={target}>
          {#each targetChoices as choice (choice)}
            <option value={choice}>{choice}</option>
          {/each}
        </select>
      {:else if type === 'todo'}
        <label for="habit-due">Due</label>
        <select id="habit-due" bind:value={due}>
          <option value="none">No date</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="pick">Pick a date</option>
        </select>
        {#if due === 'pick'}
          <label for="habit-date">Date</label>
          <input id="habit-date" type="date" bind:value={date} />
        {/if}
      {/if}

      {#if localError || error}
        <p class="error" role="alert">{localError || error}</p>
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
  .kinds {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .kind {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
    min-height: 44px;
    padding: 0.75rem 1rem;
    border: 1px solid var(--separator);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .kind-title {
    font-size: 1.0625rem;
    font-weight: 700;
  }
  .kind-description {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  .back {
    min-height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
  }
  .confirm {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .buttons .danger {
    background: var(--danger-fill);
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
