<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { BackupRepo } from '../data/backup-repo';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import type { Clock } from '../platform/clock';
  import type { ShareEnv } from '../platform/share';
  import { BackupState } from './backup.svelte';
  import BackupBanner from './BackupBanner.svelte';
  import BackupSection from './BackupSection.svelte';
  import DeletedPage from './DeletedPage.svelte';
  import ItemPage from './ItemPage.svelte';
  import ListPage from './ListPage.svelte';
  import Lists from './Lists.svelte';
  import { itemIdFromHash, listIdFromHash, routeFromHash } from './route';
  import TabBar from './TabBar.svelte';
  import Today from './Today.svelte';

  let {
    listsRepo,
    itemsRepo,
    backupRepo,
    share,
    clock,
    children,
  }: {
    listsRepo: ListsRepo;
    itemsRepo: ItemsRepo;
    backupRepo: BackupRepo;
    share: ShareEnv;
    clock: Clock;
    /** Shown above every screen (the install banner). */
    children?: Snippet;
  } = $props();

  const backup = untrack(() => new BackupState({ repo: backupRepo, share, clock }));

  let hash = $state(location.hash);
  /** The last screen that was not a detail page: where its Back link goes. */
  let backHref = $state('#/today');

  const route = $derived(routeFromHash(hash));
  const listId = $derived(listIdFromHash(hash));
  const itemId = $derived(itemIdFromHash(hash));

  // Rebuild the backup file whenever the Lists tab opens, so it holds today's data.
  $effect(() => {
    if (route === 'lists') untrack(() => void backup.load());
  });

  function navigated() {
    if (route !== 'item') backHref = hash === '' || hash === '#' ? '#/today' : hash;
    hash = location.hash;
  }
</script>

<svelte:window onhashchange={navigated} />

<main>
  {@render children?.()}
  {#if route === 'lists'}
    <BackupBanner {backup} />
    {#key backup.restores}
      <Lists repo={listsRepo} />
    {/key}
    <BackupSection {backup} />
  {:else if route === 'list'}
    {#key listId}
      <ListPage listId={listId!} {listsRepo} {itemsRepo} {clock} />
    {/key}
  {:else if route === 'deleted'}
    <DeletedPage {listsRepo} {itemsRepo} {clock} />
  {:else if route === 'item'}
    {#key itemId}
      <ItemPage itemId={itemId!} {backHref} {listsRepo} {itemsRepo} {clock} />
    {/key}
  {:else}
    <Today {listsRepo} {itemsRepo} {clock} />
  {/if}
</main>

<TabBar current={route === 'item' ? routeFromHash(backHref) : route} />
