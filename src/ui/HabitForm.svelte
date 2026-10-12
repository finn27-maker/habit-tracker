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
  // A new item starts as a to-do due today (the quickest, most common add); the Type switch
  // stays visible so a habit is always a deliberate choice.
  let type = $state<ItemType>(untrack(() => initial?.type ?? 'todo'));
  let nameField: HTMLInputElement | undefined = $state();
  let target = $state(untrack(() => initial?.target ?? 3));
  // New to-dos start due today; an edit keeps whatever date the to-do already has.
  let due = $state<Due>(untrack(() => (initial ? dueChoice(initial.dueDate) : 'today')));
  // "Pick a date" never shows an empty field: an existing date, or two days from now.
  let date = $state(untrack(() => (due === 'pick' ? initial!.dueDate : addDaysToKey(today, 2))));
  let localError = $state('');
  let confirmingDelete = $state(false);

  const editing = $derived(initial !== undefined);
  const sheetTitle = $derived.by(() => {
    if (!initial) return `New ${kindTitle(type).toLowerCase()}`;
    if (initial.type === 'weekly') return 'Edit weekly goal';
    return initial.type === 'todo' ? 'Edit to-do' : 'Edit habit';
  });
  const targetChoices = Array.from({ length: MAX_TARGET - MIN_TARGET + 1 }, (_, i) => MIN_TARGET + i);
  const typeHint = $derived(ITEM_KINDS.find((kind) => kind.type === type)!.description);

  // A new item is ready to type straight away.
  $effect(() => {
    if (!editing) untrack(() => nameField?.focus());
  });

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
    onSubmit({ title, listId, type, target, dueDate: chosen });
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
  {:else}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {#if !editing}
        <fieldset class="types" aria-describedby="type-hint">
          <legend>Type</legend>
          <div class="segments">
            {#each ITEM_KINDS as kind (kind.type)}
              <label class="segment" class:selected={type === kind.type}>
                <input type="radio" name="item-type" value={kind.type} bind:group={type} />
                {kind.title}
              </label>
            {/each}
          </div>
          <p class="hint" id="type-hint">{typeHint}</p>
        </fieldset>
      {/if}
      <label for="habit-title">Name</label>
      <input
        id="habit-title"
        type="text"
        bind:this={nameField}
        bind:value={title}
        autocomplete="off"
      />

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
  .segments {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 2px;
    border-radius: 10px;
    background: var(--separator);
  }
  .segment {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 44px;
    margin: 0;
    padding: 0 0.25rem;
    border-radius: 8px;
    color: var(--text);
    font-size: 0.9375rem;
    font-weight: 600;
    text-align: center;
  }
  .segment.selected {
    background: var(--surface);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
  }
  /* The real radio covers its segment: tappable, focusable and named by the label's text. */
  .segment input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .segment:focus-within {
    outline: 3px solid var(--accent);
    outline-offset: 1px;
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
