<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { dayKey } from '../domain/dates';
  import type { Item } from '../domain/items';
  import type { List } from '../domain/lists';
  import { buildToday } from '../domain/today';
  import type { Clock } from '../platform/clock';
  import HabitForm from './HabitForm.svelte';
  import HabitRow from './HabitRow.svelte';

  let {
    listsRepo,
    itemsRepo,
    clock,
  }: { listsRepo: ListsRepo; itemsRepo: ItemsRepo; clock: Clock } = $props();

  let now = $state(untrack(() => clock.now()));
  let lists = $state<List[]>([]);
  let items = $state<Item[]>([]);
  let days = $state<Record<string, string[]>>({});
  let loaded = $state(false);
  let notice = $state('');
  let showForm = $state(false);
  let formError = $state('');

  const today = $derived(dayKey(now));
  const groups = $derived(buildToday({ lists, items, completionDays: days, today }));
  const dateLabel = $derived(
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  );

  /** Shows what is actually in storage, or the first thing that could not be read. */
  async function refresh() {
    const [listResult, itemResult, dayResult] = await Promise.all([
      listsRepo.getAll(),
      itemsRepo.listActive(),
      itemsRepo.completionDays(),
    ]);
    if (!listResult.ok) {
      notice = listResult.error;
    } else if (!itemResult.ok) {
      notice = itemResult.error;
    } else if (!dayResult.ok) {
      notice = dayResult.error;
    } else {
      lists = listResult.value;
      items = itemResult.value;
      days = dayResult.value;
      notice = '';
      loaded = true;
    }
  }

  async function start() {
    // The starter lists must exist before anyone can add a habit, and Today is the
    // first screen. If seeding fails, the load below fails too and reports it.
    await listsRepo.ensureStarterLists();
    await refresh();
  }

  onMount(() => {
    const stopWatching = clock.watch((next) => {
      now = next;
    });
    void start();
    return stopWatching;
  });

  /** Updates the checkbox at once, then saves; puts it back if saving fails. */
  async function toggle(itemId: string) {
    // Read the clock now: the screen may still show yesterday just after midnight.
    const current = clock.now();
    now = current;
    const day = dayKey(current);

    const before = days[itemId] ?? [];
    const wasDone = before.includes(day);
    days = { ...days, [itemId]: wasDone ? before.filter((d) => d !== day) : [...before, day] };

    const result = await itemsRepo.toggleDay(itemId, day);
    if (!result.ok) {
      days = { ...days, [itemId]: before };
      notice = result.error;
    }
  }

  function openForm() {
    formError = '';
    showForm = true;
  }

  async function addHabit(values: { title: string; listId: string }) {
    const result = await itemsRepo.create({ ...values, type: 'daily' });
    if (!result.ok) {
      formError = result.error;
      return;
    }
    showForm = false;
    await refresh();
  }
</script>

<header class="bar">
  <div>
    <p class="date">{dateLabel}</p>
    <h1>Today</h1>
  </div>
  <button type="button" class="add" aria-label="New habit" onclick={openForm}>+</button>
</header>

{#if notice}
  <p class="notice" role="status">{notice}</p>
{/if}

{#each groups as group (group.list.id)}
  <section class="group" aria-labelledby="group-{group.list.id}">
    <h2 id="group-{group.list.id}">
      <span class="icon" aria-hidden="true">{group.list.emoji}</span>
      <span class="name">{group.list.name}</span>
    </h2>
    <ul class="rows">
      {#each group.rows as row (row.item.id)}
        <HabitRow {row} onToggle={() => toggle(row.item.id)} />
      {/each}
    </ul>
  </section>
{:else}
  {#if loaded}
    <section class="empty">
      <p>Nothing here yet. Tap + to add your first habit or to-do.</p>
    </section>
  {/if}
{/each}

{#if showForm}
  <HabitForm {lists} error={formError} onSubmit={addHabit} onCancel={() => (showForm = false)} />
{/if}

<style>
  .bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0.5rem 0 1rem;
  }
  .date {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  h1 {
    margin: 0.125rem 0 0;
    font-size: 2.125rem;
    font-weight: 700;
  }
  .add {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1;
  }
  .notice {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    font-weight: 600;
  }
  .group {
    margin-bottom: 1.25rem;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin: 0 0 0.375rem 0.25rem;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  /* Each row is its own component, so the divider is drawn from here. */
  .rows :global(li + li) {
    border-top: 1px solid var(--separator);
  }
  .empty {
    margin-top: 3rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-secondary);
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
</style>
