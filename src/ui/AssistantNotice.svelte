<script lang="ts">
  import { onMount } from 'svelte';
  import type { AssistantRepo } from '../data/assistant-repo';
  import { arrivalsMessage } from '../domain/assistant';

  let { repo }: { repo: AssistantRepo } = $props();

  let titles = $state<string[]>([]);

  // Remounted whenever new to-dos arrive (the Router's revision key), so this reads them.
  onMount(async () => {
    const result = await repo.unseen();
    if (result.ok) titles = result.value.map((item) => item.title);
  });

  function dismiss() {
    titles = [];
    // If OK can't be saved the card is still gone for this visit and returns next time.
    void repo.dismissUnseen();
  }
</script>

{#if titles.length > 0}
  <section class="banner" aria-label="New from your assistant">
    <p>{arrivalsMessage(titles)}</p>
    <div class="buttons">
      <button type="button" onclick={dismiss}>OK</button>
    </div>
  </section>
{/if}

<style>
  .banner {
    margin: 0.5rem 0 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
  }
  p {
    margin: 0 0 0.5rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
  }
  button {
    min-width: 44px;
    min-height: 44px;
    padding: 0 1rem;
    border: 0;
    border-radius: 10px;
    background: var(--fill);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
</style>
