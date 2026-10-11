<script lang="ts">
  let {
    needRefresh,
    offlineReady,
    onReload,
    onDismiss,
  }: {
    needRefresh: boolean;
    offlineReady: boolean;
    onReload: () => void;
    onDismiss: () => void;
  } = $props();
</script>

{#if needRefresh}
  <div class="toast" role="status">
    <span>New version available</span>
    <button type="button" class="secondary" onclick={onDismiss}>Not now</button>
    <button type="button" onclick={onReload}>Reload</button>
  </div>
{:else if offlineReady}
  <div class="toast" role="status">
    <span>✓ Ready to work offline</span>
    <button type="button" onclick={onDismiss}>OK</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 568px;
    margin: 0 auto;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-radius: 14px;
    background: var(--text);
    color: var(--bg);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
  }
  span {
    flex: 1;
    font-weight: 600;
  }
  button {
    min-height: 44px;
    padding: 0 1rem;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  button.secondary {
    background: transparent;
    color: inherit;
  }
</style>
