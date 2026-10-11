export type Route = 'today' | 'lists';

/** Hash routing works on GitHub Pages, which has no rewrite rules for deep links. */
export function routeFromHash(hash: string): Route {
  return hash === '#/lists' ? 'lists' : 'today';
}
