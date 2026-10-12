import type { Item } from './items';
import type { List } from './lists';
import { dailyStreak } from './streaks';
import { compareCompleted, compareTodos, dueLabel, isOnToday, type DueLabel } from './todos';
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

export interface TodoRow {
  kind: 'todo';
  item: Item;
  done: boolean;
  /** Absent for undated to-dos. */
  due?: DueLabel;
}

export type TodayRow = DailyRow | WeeklyRow | TodoRow;

export interface TodayGroup {
  list: List;
  rows: TodayRow[];
}

interface Sources {
  items: readonly Item[];
  completionDays: Readonly<Record<string, readonly string[]>>;
  targets: Readonly<Record<string, readonly TargetPoint[]>>;
  today: string;
  /** To-dos just checked off, kept in place (checked) for a moment so a tap can undo. */
  lingering?: ReadonlySet<string>;
}

function toRow(item: Item, sources: Sources): TodayRow {
  const days = sources.completionDays[item.id] ?? [];
  if (item.type === 'daily') {
    const { current, doneToday, atRisk } = dailyStreak(days, sources.today);
    return { kind: 'daily', item, streak: current, doneToday, atRisk };
  }
  if (item.type === 'weekly') {
    return { kind: 'weekly', item, ...weeklyStatus(days, sources.targets[item.id] ?? [], sources.today) };
  }
  return {
    kind: 'todo',
    item,
    done: item.completedAt !== undefined,
    ...(item.dueDate !== undefined ? { due: dueLabel(item.dueDate, sources.today) } : {}),
  };
}

const byOrder = (a: Item, b: Item) => a.order - b.order;

/**
 * One list's rows: habits and goals in saved order, then the to-dos `showTodo` admits in
 * due order (lingering to-dos stay where they were, checked).
 */
function listRows(listItems: readonly Item[], sources: Sources, showTodo: (item: Item) => boolean) {
  const lingering = sources.lingering ?? new Set<string>();
  const recurring = listItems.filter((item) => item.type !== 'todo').sort(byOrder);
  const todos = listItems
    .filter((item) => item.type === 'todo' && (lingering.has(item.id) || showTodo(item)))
    .sort(compareTodos);
  return [...recurring, ...todos].map((item) => toRow(item, sources));
}

/**
 * Today grouped under each list in list order: daily habits and weekly goals, then to-dos
 * that are due today, overdue or undated. Lists with nothing to show are left out, and so
 * are items whose list no longer exists.
 */
export function buildToday(input: Sources & { lists: readonly List[] }): TodayGroup[] {
  const byList = new Map<string, Item[]>();
  for (const item of input.items) {
    byList.set(item.listId, [...(byList.get(item.listId) ?? []), item]);
  }

  return [...input.lists]
    .sort((a, b) => a.order - b.order)
    .flatMap((list) => {
      const rows = listRows(byList.get(list.id) ?? [], input, (item) =>
        isOnToday(item, input.today),
      );
      return rows.length > 0 ? [{ list, rows }] : [];
    });
}

/** A list's page: everything open in it (including future to-dos), then its completed to-dos. */
export function buildListView(input: Sources & { list: List }): {
  rows: TodayRow[];
  completed: TodoRow[];
} {
  const lingering = input.lingering ?? new Set<string>();
  const listItems = input.items.filter((item) => item.listId === input.list.id);
  const completed = listItems
    .filter((item) => item.completedAt !== undefined && !lingering.has(item.id))
    .sort(compareCompleted)
    .map((item) => toRow(item, input) as TodoRow);

  return {
    rows: listRows(listItems, input, (item) => item.completedAt === undefined),
    completed,
  };
}
