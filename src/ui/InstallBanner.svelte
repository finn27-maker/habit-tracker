<script lang="ts">
  let { standalone }: { standalone: boolean } = $props();
</script>

{#if !standalone}
  <aside class="banner" role="note">
    <p class="title">
      Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen.
    </p>
    <p class="detail">
      Your data in a Safari tab is separate from the installed app, and Safari may clear it after 7
      days.
    </p>
  </aside>
{/if}

<style>
  .banner {
    margin: 0 0 1rem;
    padding: 0.875rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--text);
  }
  .title {
    margin: 0;
    font-weight: 600;
  }
  .detail {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
</style>
