import { dayNumber, parseDayKey } from './dates';
import type { Item } from './items';

export interface DueLabel {
  text: string;
  overdue: boolean;
}

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Today", "Tomorrow", a weekday this coming week, "Oct 21", or "3 days overdue". */
export function dueLabel(dueDate: string, today: string): DueLabel {
  const days = dayNumber(dueDate) - dayNumber(today);
  if (days < 0) {
    const late = -days;
    return { text: `${late} ${late === 1 ? 'day' : 'days'} overdue`, overdue: true };
  }
  if (days === 0) return { text: 'Today', overdue: false };
  if (days === 1) return { text: 'Tomorrow', overdue: false };

  const date = parseDayKey(dueDate);
  if (days < 7) return { text: weekday.format(date), overdue: false };
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4);
  return { text: (sameYear ? monthDay : monthDayYear).format(date), overdue: false };
}

/** Open to-dos that belong on Today: due today, overdue, or undated. */
export function isOnToday(item: Item, today: string): boolean {
  return item.completedAt === undefined && (item.dueDate === undefined || item.dueDate <= today);
}

/** Earliest due date first (so overdue leads), undated last, then by saved order. */
export function compareTodos(a: Item, b: Item): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === undefined) return 1;
    if (b.dueDate === undefined) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.order - b.order;
}

/** Most recently completed first. */
export function compareCompleted(a: Item, b: Item): number {
  return (b.completedAt ?? 0) - (a.completedAt ?? 0);
}
