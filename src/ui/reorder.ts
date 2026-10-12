/**
 * The place a dragged row lands: its starting place moved by whole rows, rounded to the
 * nearest, and kept within the list.
 */
export function dropIndex(from: number, offsetY: number, rowHeight: number, count: number): number {
  if (rowHeight <= 0) return from;
  const to = from + Math.round(offsetY / rowHeight);
  return Math.min(Math.max(to, 0), count - 1);
}

/**
 * How far (in pixels) a row that is not being dragged slides to make room: rows between
 * the dragged row's start and its drop place move one row the other way.
 */
export function shiftFor(index: number, from: number, to: number, rowHeight: number): number {
  if (from < to && index > from && index <= to) return -rowHeight;
  if (to < from && index >= to && index < from) return rowHeight;
  return 0;
}
