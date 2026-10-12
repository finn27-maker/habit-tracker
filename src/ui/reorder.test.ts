import { describe, expect, it } from 'vitest';
import { dropIndex, shiftFor } from './reorder';

describe('dropIndex', () => {
  it('moves by whole rows, rounding to the nearest', () => {
    expect(dropIndex(0, 100, 50, 4)).toBe(2);
    expect(dropIndex(3, -150, 50, 4)).toBe(0);
    expect(dropIndex(1, 30, 50, 4)).toBe(2);
    expect(dropIndex(1, 10, 50, 4)).toBe(1);
  });

  it('stays within the list', () => {
    expect(dropIndex(0, 1000, 50, 4)).toBe(3);
    expect(dropIndex(1, -1000, 50, 4)).toBe(0);
  });

  it('stays put when the row height is unknown', () => {
    expect(dropIndex(2, 300, 0, 4)).toBe(2);
  });
});

describe('shiftFor', () => {
  it('slides rows up when a row is dragged down past them', () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2, 50))).toEqual([0, -50, -50, 0]);
  });

  it('slides rows down when a row is dragged up past them', () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1, 50))).toEqual([0, 50, 50, 0]);
  });

  it('moves nothing when the row has not left its place', () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 2, 2, 50))).toEqual([0, 0, 0, 0]);
  });
});
