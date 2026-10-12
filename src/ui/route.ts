export type Route = 'today' | 'lists' | 'list';

const LIST_PREFIX = '#/list/';

/** Hash routing works on GitHub Pages, which has no rewrite rules for deep links. */
export function routeFromHash(hash: string): Route {
  if (hash === '#/lists') return 'lists';
  return listIdFromHash(hash) === null ? 'today' : 'list';
}

/** The list id in "#/list/<id>", or null for any other hash. */
export function listIdFromHash(hash: string): string | null {
  if (!hash.startsWith(LIST_PREFIX)) return null;
  const id = hash.slice(LIST_PREFIX.length);
  if (id === '') return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null; // a malformed escape like "%E0" is not a list
  }
}

export const listHash = (listId: string) => `${LIST_PREFIX}${encodeURIComponent(listId)}`;
