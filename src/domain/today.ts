import type { Item } from './items';
import type { List } from './lists';
import { dailyStreak } from './streaks';

export interface TodayRow {
  item: Item;
  streak: number;
  doneToday: boolean;
  atRisk: boolean;
}

export interface TodayGroup {
  list: List;
  rows: TodayRow[];
}

/**
 * Today's daily habits grouped under their lists, in list order. Lists without
 * habits are left out, and so are habits whose list no longer exists.
 * Weekly goals and to-dos get their own sections in later slices.
 */
export function buildToday(input: {
  lists: readonly List[];
  items: readonly Item[];
  completionDays: Readonly<Record<string, readonly string[]>>;
  today: string;
}): TodayGroup[] {
  const habitsByList = new Map<string, Item[]>();
  for (const item of input.items) {
    if (item.type !== 'daily') continue;
    habitsByList.set(item.listId, [...(habitsByList.get(item.listId) ?? []), item]);
  }

  return [...input.lists]
    .sort((a, b) => a.order - b.order)
    .flatMap((list) => {
      const habits = habitsByList.get(list.id);
      if (!habits) return [];
      const rows = [...habits]
        .sort((a, b) => a.order - b.order)
        .map((item): TodayRow => {
          const { current, doneToday, atRisk } = dailyStreak(
            input.completionDays[item.id] ?? [],
            input.today,
          );
          return { item, streak: current, doneToday, atRisk };
        });
      return [{ list, rows }];
    });
}
