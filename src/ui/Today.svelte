<script lang="ts">
  let { now }: { now: Date } = $props();

  const dateLabel = $derived(
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  );
</script>

<header>
  <p class="date">{dateLabel}</p>
  <h1>Today</h1>
</header>

<section class="empty">
  <p>Nothing here yet. Tap + to add your first habit or to-do.</p>
</section>

<style>
  header {
    padding: 0.5rem 0 1rem;
  }
  .date {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  h1 {
    margin: 0.125rem 0 0;
    font-size: 2.125rem;
    font-weight: 700;
  }
  .empty {
    margin-top: 3rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-secondary);
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
</style>
