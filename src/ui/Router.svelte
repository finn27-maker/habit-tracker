<script lang="ts">
  import { untrack } from 'svelte';
  import type { AssistantRepo } from '../data/assistant-repo';
  import type { BackupRepo } from '../data/backup-repo';
  import type { SyncResult } from '../platform/assistant-sync';
  import AssistantSheet from './AssistantSheet.svelte';
  import VersionLine from './VersionLine.svelte';
  import type { ItemsRepo } from '../data/items-repo';
  import type { ListsRepo } from '../data/lists-repo';
  import type { Clock } from '../platform/clock';
  import type { ShareEnv } from '../platform/share';
  import { BackupState } from './backup.svelte';
  import BackupBanner from './BackupBanner.svelte';
  import BackupSection from './BackupSection.svelte';
  import DeletedPage from './DeletedPage.svelte';
  import HistoryPage from './HistoryPage.svelte';
  import InstallBanner from './InstallBanner.svelte';
  import type { InstallHint } from './install-hint.svelte';
  import ShareApp from './ShareApp.svelte';
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
    installHint,
    appUrl,
    assistantRepo,
    runSync,
    revision = 0,
  }: {
    listsRepo: ListsRepo;
    itemsRepo: ItemsRepo;
    backupRepo: BackupRepo;
    share: ShareEnv;
    clock: Clock;
    /** The install card shown on Today in a browser tab. */
    installHint: InstallHint;
    /** The app's own address, sent by Share this app. */
    appUrl: string;
    /** The owner's assistant pairing, reached only by holding the version line. */
    assistantRepo: AssistantRepo;
    runSync: (force?: boolean) => Promise<SyncResult>;
    /** Goes up when to-dos arrive from the assistant, so the screen reloads them. */
    revision?: number;
  } = $props();

  let assistantOpen = $state(false);

  const backup = untrack(() => new BackupState({ repo: backupRepo, share, clock }));

  let hash = $state(location.hash);
  /** The last screen that was not a detail page: where its Back link goes. */
  let backHref = $state('#/today');

  const route = $derived(routeFromHash(hash));
  const listId = $derived(listIdFromHash(hash));
  const itemId = $derived(itemIdFromHash(hash));

  // Rebuild the backup file whenever Today or the Lists tab opens (both show the reminder card),
  // so it holds the latest data; pressing a backup button refreshes it again.
  $effect(() => {
    if (route === 'lists' || route === 'today') untrack(() => void backup.load());
  });

  function navigated() {
    if (route !== 'item') backHref = hash === '' || hash === '#' ? '#/today' : hash;
    hash = location.hash;
  }
</script>

<svelte:window onhashchange={navigated} />

<main>
  {#key revision}
  {#if route === 'lists'}
    <BackupBanner {backup} />
    {#key backup.restores}
      <Lists repo={listsRepo} />
    {/key}
    <ShareApp url={appUrl} {share} />
    <BackupSection {backup} />
    <VersionLine onHold={() => (assistantOpen = true)} />
  {:else if route === 'list'}
    {#key listId}
      <ListPage listId={listId!} {listsRepo} {itemsRepo} {clock} />
    {/key}
  {:else if route === 'history'}
    <HistoryPage {listsRepo} {itemsRepo} {clock} />
  {:else if route === 'deleted'}
    <DeletedPage {listsRepo} {itemsRepo} {clock} />
  {:else if route === 'item'}
    {#key itemId}
      <ItemPage itemId={itemId!} {backHref} {listsRepo} {itemsRepo} {clock} />
    {/key}
  {:else}
    <InstallBanner hint={installHint} />
    <BackupBanner {backup} />
    <Today {listsRepo} {itemsRepo} {clock} />
  {/if}
  {/key}
</main>

{#if assistantOpen}
  <AssistantSheet repo={assistantRepo} {runSync} onClose={() => (assistantOpen = false)} />
{/if}

<TabBar current={route === 'item' ? routeFromHash(backHref) : route} />
