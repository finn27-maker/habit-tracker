import { describe, expect, it } from 'vitest';
import { arrivalsMessage } from './assistant';

describe('arrivalsMessage', () => {
  it('names one, two or three arrivals', () => {
    expect(arrivalsMessage(['Pay Xcel bill'])).toBe('1 new to-do from your assistant: Pay Xcel bill');
    expect(arrivalsMessage(['Pay the plumber', 'Book dentist'])).toBe(
      '2 new to-dos from your assistant: Pay the plumber and Book dentist',
    );
    expect(arrivalsMessage(['A', 'B', 'C'])).toBe('3 new to-dos from your assistant: A, B and C');
  });

  it('summarises more than three', () => {
    expect(arrivalsMessage(['A', 'B', 'C', 'D', 'E'])).toBe(
      '5 new to-dos from your assistant: A, B, C and 2 more',
    );
    const fifty = Array.from({ length: 50 }, (_, i) => `T${i}`);
    expect(arrivalsMessage(fifty)).toBe('50 new to-dos from your assistant: T0, T1, T2 and 47 more');
  });
});
