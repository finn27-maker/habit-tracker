<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import { heatmapWeeks } from '../domain/history';
  import { buildOverview, overviewHeatmapLabel } from '../domain/overview';
  import type { Clock } from '../platform/clock';
  import { Board } from './board.svelte';
  import Heatmap from './Heatmap.svelte';
  import { itemHash } from './route';

  let {
    listsRepo,
    itemsRepo,
    clock,
  }: { listsRepo: ListsRepo; itemsRepo: ItemsRepo; clock: Clock } = $props();

  const board = untrack(() => new Board({ listsRepo, itemsRepo, clock }));

  const overview = $derived(
    buildOverview({
      lists: board.lists,
      items: board.items,
      completionDays: board.days,
      targets: board.targets,
      today: board.today,
    }),
  );
  const weeks = $derived(heatmapWeeks(board.today));

  onMount(() => board.mount());
</script>

<header class="bar">
  <h1>History</h1>
</header>

{#if board.notice}
  <p class="notice" role="status">{board.notice}</p>
{/if}

{#if overview.rows.length > 0}
  <Heatmap
    {weeks}
    counts={overview.counts}
    today={board.today}
    label={overviewHeatmapLabel(weeks, overview.counts, board.today, overview.rows.length)}
  />
  <ul class="rows">
    {#each overview.rows as row (row.item.id)}
      <li>
        <a class="row" href={itemHash(row.item.id)}>
          <span class="name">{row.item.title}</span>
          <span class="detail">{row.list.emoji} {row.list.name}</span>
          <span class="line">{row.line}</span>
        </a>
      </li>
    {/each}
  </ul>
{:else if board.loaded}
  <p class="empty">No habits or weekly goals yet. Add one with + on Today.</p>
{/if}

<style>
  .bar {
    padding: 0.5rem 0 0.5rem;
  }
  h1 {
    margin: 0;
    font-size: 2.125rem;
    font-weight: 700;
  }
  .notice {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    font-weight: 600;
  }
  .rows {
    margin: 1.25rem 0 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  li + li {
    border-top: 1px solid var(--separator);
  }
  .row {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 3.5rem;
    padding: 0.5rem 0.75rem;
    color: inherit;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .name {
    font-size: 1.0625rem;
  }
  .detail,
  .line {
    color: var(--text-secondary);
    font-size: 0.8125rem;
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
