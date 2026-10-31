<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import {
    countLabel,
    dayCounts,
    heatmapSummary,
    heatmapWeeks,
    historyStats,
    ratePercent,
    type Rate,
  } from '../domain/history';
  import { buildListView } from '../domain/today';
  import type { Clock } from '../platform/clock';
  import { Board } from './board.svelte';
  import BoardSheet from './BoardSheet.svelte';
  import Heatmap from './Heatmap.svelte';
  import HistoryCalendar from './HistoryCalendar.svelte';

  let {
    itemId,
    backHref,
    listsRepo,
    itemsRepo,
    clock,
  }: {
    itemId: string;
    /** Where Back (and a delete) returns to. */
    backHref: string;
    listsRepo: ListsRepo;
    itemsRepo: ItemsRepo;
    clock: Clock;
  } = $props();

  const board = untrack(() => new Board({ listsRepo, itemsRepo, clock }));

  // To-dos have no history page; their name opens Edit instead.
  const item = $derived(
    board.items.find((candidate) => candidate.id === itemId && candidate.type !== 'todo'),
  );
  const days = $derived(board.days[itemId] ?? []);
  const counts = $derived(dayCounts(days));
  const stats = $derived(
    item
      ? historyStats(
          item.type as 'daily' | 'weekly',
          days,
          board.targets[itemId] ?? [],
          board.today,
          item.startedOn,
        )
      : null,
  );
  const weeks = $derived(heatmapWeeks(board.today));
  const heatmapLabel = $derived.by(() => {
    if (item?.type === 'daily') {
      const { done, total } = heatmapSummary(weeks, new Set(days), board.today);
      return `Last 6 months: ${done} of ${total} days done`;
    }
    const first = weeks[0]![0]!;
    const logs = days.filter((day) => day >= first && day <= board.today).length;
    return `Last 6 months: ${countLabel(logs, 'log')}`;
  });

  /** The row the Edit sheet starts from. */
  function editRow() {
    const list = board.lists.find((candidate) => candidate.id === item!.listId)!;
    const view = buildListView({
      list,
      items: board.items,
      completionDays: board.days,
      targets: board.targets,
      today: board.today,
    });
    return view.rows.find((row) => row.item.id === itemId)!;
  }

  const percent = (rate: Rate) => {
    const value = ratePercent(rate);
    return value === null ? '—' : `${value}%`;
  };

  // Once shown, the item disappearing means it was just deleted here: go back.
  let seen = false;
  $effect(() => {
    if (item) seen = true;
    else if (seen && board.loaded) location.hash = backHref;
  });

  onMount(() => board.mount());
</script>

<header class="bar">
  <a class="back" href={backHref}><span aria-hidden="true">‹ </span>Back</a>
  {#if item}
    <button type="button" class="edit" onclick={() => board.openForm({ kind: 'edit', row: editRow() })}>
      Edit
    </button>
  {/if}
</header>

{#if board.notice}
  <p class="notice" role="status">{board.notice}</p>
{/if}

{#if item && stats}
  <h1>{item.title}</h1>

  <dl class="stats">
    <div>
      <dt>Current streak</dt>
      <dd>{countLabel(stats.current, stats.unit)}</dd>
    </div>
    <div>
      <dt>Best streak</dt>
      <dd>{countLabel(stats.best, stats.unit)}</dd>
    </div>
    <div>
      <dt>{stats.recentLabel}</dt>
      <dd>{percent(stats.recent)}</dd>
    </div>
    <div>
      <dt>All time</dt>
      <dd>{percent(stats.allTime)}</dd>
    </div>
    <div>
      <dt>Total</dt>
      <dd>{stats.total}</dd>
    </div>
  </dl>

  <HistoryCalendar
    kind={item.type as 'daily' | 'weekly'}
    {counts}
    today={board.today}
    onPick={(day) => board.backfill(itemId, day)}
  />

  <Heatmap
    {weeks}
    {counts}
    today={board.today}
    label={heatmapLabel}
    binary={item.type === 'daily'}
  />
{:else if board.loaded}
  <p class="empty">This habit no longer exists</p>
{/if}

<BoardSheet {board} />

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0 0.25rem;
  }
  .back,
  .edit {
    display: inline-flex;
    align-items: center;
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    text-decoration: none;
  }
  h1 {
    margin: 0 0 1rem;
    font-size: 2.125rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .notice {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    font-weight: 600;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: 0.5rem;
    margin: 0;
  }
  .stats div {
    padding: 0.625rem 0.75rem;
    border-radius: 12px;
    background: var(--surface);
  }
  dt {
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  dd {
    margin: 0.125rem 0 0;
    font-size: 1.25rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin-top: 2rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-secondary);
    text-align: center;
  }
</style>
