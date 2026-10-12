<script lang="ts">
  import { shareLink, type ShareEnv } from '../platform/share';

  let { url, share }: { url: string; share: ShareEnv } = $props();

  let message = $state('');

  // share() runs straight from the tap: the share sheet needs it.
  async function send() {
    message = '';
    const outcome = await shareLink(url, share);
    if (outcome === 'copied') message = 'Link copied';
    else if (outcome === 'shown') message = `Copy this link: ${url}`;
  }
</script>

<section class="share" aria-label="Share this app">
  <button type="button" onclick={send}>Share this app</button>
  <p class="message" role="status">{message}</p>
</section>

<style>
  .share {
    margin-top: 2rem;
  }
  button {
    width: 100%;
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    background: var(--fill);
    color: #fff;
    font: inherit;
    font-weight: 600;
  }
  .message {
    margin: 0.5rem 0 0;
    overflow-wrap: anywhere;
    user-select: text;
  }
  /* Kept in the page while empty so screen readers announce what appears in it. */
  .message:empty {
    margin: 0;
  }
</style>
