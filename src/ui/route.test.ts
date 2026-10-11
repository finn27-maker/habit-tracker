import { describe, expect, it } from 'vitest';
import { routeFromHash } from './route';

describe('routeFromHash', () => {
  it('maps #/lists to the Lists tab', () => {
    expect(routeFromHash('#/lists')).toBe('lists');
  });

  it.each(['#/today', '', '#', '#/nonsense'])('falls back to Today for %j', (hash) => {
    expect(routeFromHash(hash)).toBe('today');
  });
});
