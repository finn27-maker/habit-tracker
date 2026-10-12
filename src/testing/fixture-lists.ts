import type { ListInput } from '../domain/lists';

/**
 * Lists the unit tests seed instead of the real starters, so product copy can change without
 * rewriting every test. These were the app's original starters (list-1 … list-4 in fixtures).
 */
export const FIXTURE_LISTS: readonly ListInput[] = [
  { name: 'Fitness', emoji: '🏋️', color: 'orange' },
  { name: 'Work', emoji: '💼', color: 'blue' },
  { name: 'Side Business', emoji: '🚀', color: 'purple' },
  { name: 'Personal', emoji: '🏠', color: 'green' },
];
