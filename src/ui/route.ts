export type Route = 'today' | 'upcoming' | 'history' | 'lists' | 'list' | 'item' | 'deleted';

const LIST_PREFIX = '#/list/';
const ITEM_PREFIX = '#/item/';

/** Hash routing works on GitHub Pages, which has no rewrite rules for deep links. */
export function routeFromHash(hash: string): Route {
  if (hash === '#/lists') return 'lists';
  if (hash === '#/upcoming') return 'upcoming';
  if (hash === '#/history') return 'history';
  if (hash === '#/deleted') return 'deleted';
  if (listIdFromHash(hash) !== null) return 'list';
  return itemIdFromHash(hash) === null ? 'today' : 'item';
}

/** The decoded id after `prefix`, or null for any other hash. */
function idFromHash(hash: string, prefix: string): string | null {
  if (!hash.startsWith(prefix)) return null;
  const id = hash.slice(prefix.length);
  if (id === '') return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null; // a malformed escape like "%E0" is not an id
  }
}

/** The list id in "#/list/<id>", or null for any other hash. */
export const listIdFromHash = (hash: string) => idFromHash(hash, LIST_PREFIX);

/** The habit or goal id in "#/item/<id>", or null for any other hash. */
export const itemIdFromHash = (hash: string) => idFromHash(hash, ITEM_PREFIX);

export const listHash = (listId: string) => `${LIST_PREFIX}${encodeURIComponent(listId)}`;

export const itemHash = (itemId: string) => `${ITEM_PREFIX}${encodeURIComponent(itemId)}`;
