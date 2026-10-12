import { dropIndex, shiftFor } from './reorder';

interface Drag {
  id: string;
  from: number;
  startY: number;
  offset: number;
  rowHeight: number;
}

/**
 * One drag at a time over a column of rows: the dragged row follows the finger, the rows it
 * passes slide out of the way, and letting go calls `drop` with the new place.
 */
export class RowDrag {
  drag = $state<Drag | null>(null);
  /** Where the dragged row would land now, or null when nothing is dragged. */
  readonly target: number | null;

  readonly #count: () => number;
  readonly #drop: (id: string, to: number) => unknown;

  constructor(count: () => number, drop: (id: string, to: number) => unknown) {
    this.#count = count;
    this.#drop = drop;
    this.target = $derived(
      this.drag ? dropIndex(this.drag.from, this.drag.offset, this.drag.rowHeight, this.#count()) : null,
    );
  }

  start(event: PointerEvent, id: string, index: number) {
    if (event.button !== 0) return; // a mouse's right button is not a drag
    const handle = event.currentTarget as HTMLElement;
    // Keep receiving moves even when the finger leaves the small handle.
    handle.setPointerCapture?.(event.pointerId);
    this.drag = {
      id,
      from: index,
      startY: event.clientY,
      offset: 0,
      rowHeight: handle.closest('li')!.getBoundingClientRect().height,
    };
  }

  follow(event: PointerEvent) {
    if (this.drag) this.drag.offset = event.clientY - this.drag.startY;
  }

  async end() {
    const drag = this.drag;
    const to = this.target;
    if (!drag || to === null) return;
    this.drag = null;
    if (to !== drag.from) await this.#drop(drag.id, to);
  }

  cancel() {
    this.drag = null;
  }

  isDragging = (id: string) => this.drag?.id === id;
  isMakingRoom = (id: string) => this.drag !== null && this.drag.id !== id;

  /** The vertical shift for the row at `index` while something is being dragged. */
  shift(index: number): string | undefined {
    if (!this.drag || this.target === null) return undefined;
    const pixels =
      index === this.drag.from
        ? this.drag.offset
        : shiftFor(index, this.drag.from, this.target, this.drag.rowHeight);
    return pixels === 0 ? undefined : `translateY(${pixels}px)`;
  }
}
