<script lang="ts">
  import type { Route } from './route';

  let { current }: { current: Route } = $props();
</script>

<nav aria-label="Main">
  <a href="#/today" aria-current={current === 'today' ? 'page' : undefined}>
    <span class="icon" aria-hidden="true">☀️</span>
    Today
  </a>
  <a href="#/lists" aria-current={current === 'lists' || current === 'list' ? 'page' : undefined}>
    <span class="icon" aria-hidden="true">☰</span>
    Lists
  </a>
</nav>

<style>
  nav {
    position: fixed;
    z-index: 5;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    padding-bottom: env(safe-area-inset-bottom);
    border-top: 1px solid var(--separator);
    background: var(--surface);
  }
  a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    min-height: 3.5rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;
  }
  a[aria-current='page'] {
    color: var(--accent);
  }
  .icon {
    font-size: 1.25rem;
    line-height: 1;
  }
</style>
