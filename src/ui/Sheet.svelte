<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="backdrop">
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
    <h2>{title}</h2>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 20; /* above the update toast (10) and the tab bar (5) */
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgb(0 0 0 / 0.4);
  }
  .sheet {
    width: 100%;
    max-width: 600px;
    max-height: 90%;
    overflow-y: auto;
    padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
    border-radius: 16px 16px 0 0;
    background: var(--surface);
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }
</style>
