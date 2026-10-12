import { describe, expect, it } from 'vitest';
import { moveRecurring } from './order';

const items = [
  { id: 'stretch', type: 'daily' as const, order: 0 },
  { id: 'shoes', type: 'todo' as const, order: 1 },
  { id: 'peloton', type: 'weekly' as const, order: 2 },
  { id: 'run', type: 'daily' as const, order: 5 },
];
const ids = (list: { id: string; order: number }[]) => list.map((item) => `${item.id}:${item.order}`);

describe('moveRecurring', () => {
  it('moves a habit among the habits and goals and renumbers, to-dos last', () => {
    expect(ids(moveRecurring(items, 'peloton', 0))).toEqual(['peloton:0', 'stretch:1', 'run:2', 'shoes:3']);
    expect(ids(moveRecurring(items, 'stretch', 99))).toEqual(['peloton:0', 'run:1', 'stretch:2', 'shoes:3']);
  });

  it('keeps everything else as it was and does not change its input', () => {
    const copy = items.map((item) => ({ ...item }));
    expect(moveRecurring(copy, 'peloton', 1)[0]).toEqual({ id: 'stretch', type: 'daily', order: 0 });
    expect(copy).toEqual(items);
  });
});
