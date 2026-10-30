<script lang="ts">
  import { APP_VERSION } from '../domain/version';
  import { holdGesture } from './hold';

  let { onHold }: { onHold: () => void } = $props();
</script>

<!--
  Looks and reads the same for everyone. Holding it for 3 seconds (touch, VoiceOver double-tap
  and hold, or Enter/Space) opens the owner's Assistant pairing; a tap does nothing. It is
  focusable so the keyboard hold works.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<p class="version" tabindex="0" use:holdGesture={{ onHold }}>Version {APP_VERSION}</p>

<style>
  .version {
    margin: 2rem 0 1rem;
    padding: 0.75rem 0;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    /* Otherwise the browser may take over a held touch (pointercancel) to scroll or long-press. */
    touch-action: none;
  }
</style>
