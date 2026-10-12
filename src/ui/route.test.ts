import { describe, expect, it } from 'vitest';
import { listHash, listIdFromHash, routeFromHash } from './route';

describe('routeFromHash', () => {
  it('maps #/lists to the Lists tab', () => {
    expect(routeFromHash('#/lists')).toBe('lists');
  });

  it('maps #/list/<id> to a list page', () => {
    expect(routeFromHash('#/list/list-4')).toBe('list');
  });

  it.each(['#/today', '', '#', '#/nonsense', '#/list/', '#/list/%E0'])(
    'falls back to Today for %j',
    (hash) => {
      expect(routeFromHash(hash)).toBe('today');
    },
  );
});

describe('listIdFromHash', () => {
  it('reads and decodes the id', () => {
    expect(listIdFromHash('#/list/list-4')).toBe('list-4');
    expect(listIdFromHash(listHash('a b/c'))).toBe('a b/c');
  });

  it.each(['#/lists', '#/list/', '#/list/%E0', ''])('is null for %j', (hash) => {
    expect(listIdFromHash(hash)).toBeNull();
  });
});
