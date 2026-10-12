import { describe, expect, it } from 'vitest';
import { itemHash, itemIdFromHash, listHash, listIdFromHash, routeFromHash } from './route';

describe('routeFromHash', () => {
  it('maps #/lists to the Lists tab', () => {
    expect(routeFromHash('#/lists')).toBe('lists');
  });

  it('maps #/deleted to Recently deleted', () => {
    expect(routeFromHash('#/deleted')).toBe('deleted');
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

describe('item pages', () => {
  it('maps #/item/<id> to an item page and reads the id', () => {
    expect(routeFromHash('#/item/item-1')).toBe('item');
    expect(itemIdFromHash(itemHash('a b/c'))).toBe('a b/c');
  });

  it.each(['#/item/', '#/item/%E0', '#/list/x', ''])('has no item id for %j', (hash) => {
    expect(itemIdFromHash(hash)).toBeNull();
  });
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
