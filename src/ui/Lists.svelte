<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ListsRepo } from '../data/lists-repo';
  import { LIST_COLORS, moveToIndex, type List, type ListInput } from '../domain/lists';
  import type { Result } from '../domain/result';
  import ListForm from './ListForm.svelte';
  import { dropIndex, shiftFor } from './reorder';
  import { listHash } from './route';

  let { repo }: { repo: ListsRepo } = $props();

  let lists = $state<List[]>([]);
  let loaded = $state(false);
  let editing = $state(false);
  let form = $state<{ id: string | null; initial: ListInput } | null>(null);
  let formError = $state('');
  let notice = $state('');
  let pendingDelete = $state<{ list: List; itemCount: number } | null>(null);

  const NEW_LIST: ListInput = { name: '', emoji: '', color: 'blue' };

  /**
   * Shows what is actually in storage, so the screen never drifts from it.
   * `failure` is a write error to keep showing; it wins over a load error so the
   * message never flashes the wrong text.
   */
  async function reload(failure = '') {
    const result = await repo.getAll();
    if (result.ok) {
      lists = result.value;
      loaded = true;
      notice = failure;
    } else {
      notice = failure || result.error;
    }
  }

  /** After any write: refresh, and keep the write's own failure visible if it had one. */
  async function settle(result: Result<unknown>) {
    await reload(result.ok ? '' : result.error);
  }

  onMount(async () => {
    // If seeding fails, the load below fails too and reports the problem.
    await repo.ensureStarterLists();
    await reload();
  });

  function openForm(list: List | null) {
    formError = '';
    form = list
      ? { id: list.id, initial: { name: list.name, emoji: list.emoji, color: list.color } }
      : { id: null, initial: NEW_LIST };
  }

  async function submit(target: { id: string | null }, values: ListInput) {
    const result =
      target.id === null ? await repo.create(values) : await repo.update(target.id, values);
    if (result.ok) {
      form = null;
    } else {
      formError = result.error;
    }
    await reload();
  }

  /** Shows the new order at once, saves it, and puts the old order back if saving fails. */
  async function moveTo(list: List, to: number) {
    const before = lists;
    const ids = moveToIndex(
      lists.map((other) => other.id),
      list.id,
      to,
    );
    lists = ids.map((id) => before.find((other) => other.id === id)!);
    const result = await repo.moveTo(list.id, to);
    if (!result.ok) lists = before;
    await settle(result);
  }

  // --- Drag to reorder (Edit mode) ---

  let drag = $state<{ id: string; from: number; startY: number; offset: number; rowHeight: number } | null>(
    null,
  );
  const target = $derived(
    drag ? dropIndex(drag.from, drag.offset, drag.rowHeight, lists.length) : null,
  );

  function startDrag(event: PointerEvent, list: List, index: number) {
    if (event.button !== 0) return; // a mouse's right button is not a drag
    const handle = event.currentTarget as HTMLElement;
    // Keep receiving moves even when the finger leaves the small handle.
    handle.setPointerCapture?.(event.pointerId);
    drag = {
      id: list.id,
      from: index,
      startY: event.clientY,
      offset: 0,
      rowHeight: handle.closest('li')!.getBoundingClientRect().height,
    };
  }

  function followDrag(event: PointerEvent) {
    if (drag) drag.offset = event.clientY - drag.startY;
  }

  async function endDrag() {
    if (!drag || target === null) return;
    const { from } = drag;
    const to = target;
    const list = lists[from]!;
    drag = null;
    if (to !== from) await moveTo(list, to);
  }

  /** The vertical shift for a row while something is being dragged. */
  function rowShift(index: number): string | undefined {
    if (!drag || target === null) return undefined;
    const pixels =
      index === drag.from ? drag.offset : shiftFor(index, drag.from, target, drag.rowHeight);
    return pixels === 0 ? undefined : `translateY(${pixels}px)`;
  }

  /** Arrow keys on the handle move the list one place, for people not using touch. */
  async function nudge(event: KeyboardEvent, list: List, index: number) {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const to = index + step;
    if (to < 0 || to >= lists.length) return;
    await moveTo(list, to);
    await tick();
    // Moving the row can drop focus; keep it on this handle so the keys keep working.
    document.querySelector<HTMLElement>(`[data-reorder="${CSS.escape(list.id)}"]`)?.focus();
  }

  async function askDelete(list: List) {
    const count = await repo.openItemCount(list.id);
    if (!count.ok) {
      notice = count.error;
      return;
    }
    pendingDelete = { list, itemCount: count.value };
  }

  async function confirmDelete(list: List) {
    pendingDelete = null;
    await settle(await repo.remove(list.id));
  }

  function deleteMessage({ list, itemCount }: { list: List; itemCount: number }): string {
    if (itemCount === 0) return `Delete "${list.name}"?`;
    const items = itemCount === 1 ? '1 item' : `${itemCount} items`;
    return `Delete "${list.name}" and its ${items}? Their history will be archived.`;
  }
</script>

<header class="bar">
  <h1>Lists</h1>
  <div class="actions">
    <button type="button" class="text" onclick={() => (editing = !editing)}>
      {editing ? 'Done' : 'Edit'}
    </button>
    <button type="button" class="add" aria-label="New list" onclick={() => openForm(null)}>
      +
    </button>
  </div>
</header>

{#if notice}
  <p class="notice" role="status">{notice}</p>
{/if}

{#snippet label(list: List)}
  <span class="icon" style:background={LIST_COLORS[list.color]} aria-hidden="true">
    {list.emoji}
  </span>
  <span class="name">{list.name}</span>
{/snippet}

{#if lists.length > 0}
  <ul class="rows">
    {#each lists as list, index (list.id)}
      <li
        class="row"
        class:dragging={drag?.id === list.id}
        class:settling={drag !== null && drag.id !== list.id}
        style:transform={rowShift(index)}
      >
        {#if !editing}
          <!-- Edit mode needs the row for its tools, so the row only opens the page outside it. -->
          <a class="open" href={listHash(list.id)}>
            {@render label(list)}
            <span class="chevron" aria-hidden="true">›</span>
          </a>
        {:else}
          {@render label(list)}
          <span class="tools">
            <button type="button" aria-label="Edit {list.name}" onclick={() => openForm(list)}>
              ✎
            </button>
            <button
              type="button"
              class="danger"
              aria-label="Delete {list.name}"
              onclick={() => askDelete(list)}
            >
              🗑
            </button>
            <button
              type="button"
              class="handle"
              aria-label="Reorder {list.name}"
              data-reorder={list.id}
              onpointerdown={(event) => startDrag(event, list, index)}
              onpointermove={followDrag}
              onpointerup={endDrag}
              onpointercancel={() => (drag = null)}
              onkeydown={(event) => nudge(event, list, index)}
            >
              ☰
            </button>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
{:else if loaded}
  <p class="empty">No lists yet. Tap + to create one.</p>
{/if}

{#if form}
  {@const current = form}
  <ListForm
    title={current.id === null ? 'New list' : 'Edit list'}
    initial={current.initial}
    error={formError}
    onSubmit={(values) => submit(current, values)}
    onCancel={() => (form = null)}
  />
{/if}

{#if pendingDelete}
  {@const pending = pendingDelete}
  <div class="backdrop">
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <p id="confirm-title">{deleteMessage(pending)}</p>
      <div class="buttons">
        <button type="button" class="secondary" onclick={() => (pendingDelete = null)}>
          Cancel
        </button>
        <button type="button" class="destructive" onclick={() => confirmDelete(pending.list)}>
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0 1rem;
  }
  h1 {
    margin: 0;
    font-size: 2.125rem;
    font-weight: 700;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .actions button {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
  }
  .add {
    font-size: 1.75rem;
    line-height: 1;
  }
  .notice {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    font-weight: 600;
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0.25rem 0.75rem;
  }
  .row + .row {
    border-top: 1px solid var(--separator);
  }
  .open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    min-height: 3rem;
    color: var(--text);
    text-decoration: none;
  }
  .chevron {
    flex: none;
    color: var(--text-secondary);
    font-size: 1.5rem;
    line-height: 1;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    font-size: 1.25rem;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 1.0625rem;
  }
  .tools {
    display: flex;
  }
  .tools button {
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-size: 1.125rem;
  }
  .tools button:disabled {
    color: var(--text-secondary);
    opacity: 0.4;
  }
  .tools .danger {
    color: var(--danger);
  }
  .tools .handle {
    color: var(--text-secondary);
    font-size: 1.25rem;
    cursor: grab;
    /* The handle's drag must move the row, not scroll the page. */
    touch-action: none;
  }
  .row.dragging {
    position: relative;
    z-index: 1;
    background: var(--surface);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
  }
  .row.settling {
    transition: transform 0.15s ease;
  }
  .empty {
    margin-top: 3rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-secondary);
    text-align: center;
  }
  .backdrop {
    position: fixed;
    z-index: 20; /* above the update toast (10) and the tab bar (5) */
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.4);
  }
  .confirm {
    width: 100%;
    max-width: 360px;
    padding: 1.25rem;
    border-radius: 14px;
    background: var(--surface);
  }
  .confirm p {
    margin: 0 0 1rem;
    font-weight: 600;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  .buttons button {
    flex: 1;
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  .buttons .secondary {
    background: var(--bg);
    color: var(--text);
  }
  .buttons .destructive {
    background: var(--danger);
  }
</style>
