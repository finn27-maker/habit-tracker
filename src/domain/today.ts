import type { Item } from './items';
import type { List } from './lists';
import { dailyStreak } from './streaks';
import { weeklyStatus, type TargetPoint } from './weekly';

export interface DailyRow {
  kind: 'daily';
  item: Item;
  streak: number;
  doneToday: boolean;
  atRisk: boolean;
}

export interface WeeklyRow {
  kind: 'weekly';
  item: Item;
  /** Completions this week, which keeps counting past the target. */
  count: number;
  target: number;
  met: boolean;
  /** Weeks in a row that reached their target. */
  streak: number;
  streakAtRisk: boolean;
}

export type TodayRow = DailyRow | WeeklyRow;

export interface TodayGroup {
  list: List;
  rows: TodayRow[];
}

/**
 * Today's daily habits and weekly goals grouped under their lists, in list order and then
 * in each item's saved order. Lists without items are left out, and so are items whose
 * list no longer exists. To-dos get their own section in a later slice.
 */
export function buildToday(input: {
  lists: readonly List[];
  items: readonly Item[];
  completionDays: Readonly<Record<string, readonly string[]>>;
  targets: Readonly<Record<string, readonly TargetPoint[]>>;
  today: string;
}): TodayGroup[] {
  const itemsByList = new Map<string, Item[]>();
  for (const item of input.items) {
    if (item.type === 'todo') continue;
    itemsByList.set(item.listId, [...(itemsByList.get(item.listId) ?? []), item]);
  }

  const toRow = (item: Item): TodayRow => {
    const days = input.completionDays[item.id] ?? [];
    if (item.type === 'daily') {
      const { current, doneToday, atRisk } = dailyStreak(days, input.today);
      return { kind: 'daily', item, streak: current, doneToday, atRisk };
    }
    const status = weeklyStatus(days, input.targets[item.id] ?? [], input.today);
    return { kind: 'weekly', item, ...status };
  };

  return [...input.lists]
    .sort((a, b) => a.order - b.order)
    .flatMap((list) => {
      const items = itemsByList.get(list.id);
      if (!items) return [];
      const rows = [...items].sort((a, b) => a.order - b.order).map(toRow);
      return [{ list, rows }];
    });
}
