export interface HoldOptions {
  onHold: () => void;
  /** How long the press must last. */
  ms?: number;
}

/** A finger that drifts further than this is scrolling, not holding. */
const MOVE_TOLERANCE_PX = 10;
const DEFAULT_HOLD_MS = 3_000;

/**
 * Calls `onHold` only after an unbroken press: a pointer held still (VoiceOver users get this
 * with double-tap and hold), or Enter or Space held down. A tap, a short press, a scroll or
 * leaving the element does nothing (decision dfe098dd).
 */
export function holdGesture(node: HTMLElement, options: HoldOptions) {
  let current = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const start = () => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      current.onHold();
    }, current.ms ?? DEFAULT_HOLD_MS);
  };

  const onPointerDown = (event: PointerEvent) => {
    startX = event.clientX;
    startY = event.clientY;
    start();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX) cancel();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      start();
    }
  };
  // iOS shows a text menu on a long press; the hold must not trigger it.
  const onContextMenu = (event: Event) => event.preventDefault();

  const listeners: [string, EventListener][] = [
    ['pointerdown', onPointerDown as EventListener],
    ['pointermove', onPointerMove as EventListener],
    ['pointerup', cancel],
    ['pointercancel', cancel],
    ['pointerleave', cancel],
    ['keydown', onKeyDown as EventListener],
    ['keyup', cancel],
    ['blur', cancel],
    ['contextmenu', onContextMenu],
  ];
  for (const [type, listener] of listeners) node.addEventListener(type, listener);

  return {
    update(next: HoldOptions) {
      current = next;
    },
    destroy() {
      cancel();
      for (const [type, listener] of listeners) node.removeEventListener(type, listener);
    },
  };
}
