<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import type { Clock } from '../platform/clock';
  import ItemPage from './ItemPage.svelte';
  import ListPage from './ListPage.svelte';
  import Lists from './Lists.svelte';
  import { itemIdFromHash, listIdFromHash, routeFromHash } from './route';
  import TabBar from './TabBar.svelte';
  import Today from './Today.svelte';

  let {
    listsRepo,
    itemsRepo,
    clock,
    children,
  }: {
    listsRepo: ListsRepo;
    itemsRepo: ItemsRepo;
    clock: Clock;
    /** Shown above every screen (the install banner). */
    children?: Snippet;
  } = $props();

  let hash = $state(location.hash);
  /** The last screen that was not a detail page: where its Back link goes. */
  let backHref = $state('#/today');

  const route = $derived(routeFromHash(hash));
  const listId = $derived(listIdFromHash(hash));
  const itemId = $derived(itemIdFromHash(hash));

  function navigated() {
    if (route !== 'item') backHref = hash === '' || hash === '#' ? '#/today' : hash;
    hash = location.hash;
  }
</script>

<svelte:window onhashchange={navigated} />

<main>
  {@render children?.()}
  {#if route === 'lists'}
    <Lists repo={listsRepo} />
  {:else if route === 'list'}
    {#key listId}
      <ListPage listId={listId!} {listsRepo} {itemsRepo} {clock} />
    {/key}
  {:else if route === 'item'}
    {#key itemId}
      <ItemPage itemId={itemId!} {backHref} {listsRepo} {itemsRepo} {clock} />
    {/key}
  {:else}
    <Today {listsRepo} {itemsRepo} {clock} />
  {/if}
</main>

<TabBar current={route === 'item' ? routeFromHash(backHref) : route} />
