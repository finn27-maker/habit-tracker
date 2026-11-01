import { dayNumber } from './dates';
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

export type UpcomingKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export interface UpcomingRow extends TodoRow {
  list: List;
}

export interface UpcomingSection {
  key: UpcomingKey;
  title: string;
  rows: UpcomingRow[];
}

const UPCOMING_TITLES: Record<UpcomingKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  none: 'No date',
};

/** Which section a to-do falls in: "This week" is the 2 to 6 days after today. */
function upcomingKey(item: Item, today: string): UpcomingKey {
  if (item.dueDate === undefined) return 'none';
  const days = dayNumber(item.dueDate) - dayNumber(today);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days < 7 ? 'week' : 'later';
}

/**
 * Every open to-do from every list, earliest due first, in date sections. Habits, goals and
 * finished to-dos are left out (lingering ones stay, checked), as are items whose list no
 * longer exists, and so are empty sections.
 */
export function buildUpcoming(input: Sources & { lists: readonly List[] }): UpcomingSection[] {
  const lingering = input.lingering ?? new Set<string>();
  const listById = new Map(input.lists.map((list) => [list.id, list]));
  const todos = input.items
    .filter(
      (item) => item.type === 'todo' && (item.completedAt === undefined || lingering.has(item.id)),
    )
    .sort(compareTodos);

  const sections: Record<UpcomingKey, UpcomingRow[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: [],
    none: [],
  };
  for (const item of todos) {
    const list = listById.get(item.listId);
    if (list === undefined) continue;
    const row = toRow(item, input) as TodoRow;
    sections[upcomingKey(item, input.today)].push({ ...row, list });
  }
  return (Object.keys(UPCOMING_TITLES) as UpcomingKey[]).flatMap((key) =>
    sections[key].length > 0 ? [{ key, title: UPCOMING_TITLES[key], rows: sections[key] }] : [],
  );
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
