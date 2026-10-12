import { countLabel, dayCounts, historyStats, ratePercent, type HistoryStats } from './history';
import type { Item } from './items';
import type { List } from './lists';
import type { TargetPoint } from './weekly';

export interface OverviewRow {
  item: Item;
  list: List;
  stats: HistoryStats;
  /** "3 days now · Best 12 days · Last 30 days 40%". */
  line: string;
}

export interface Overview {
  rows: OverviewRow[];
  /** Check-ins per day across every habit and goal shown. */
  counts: Map<string, number>;
}

/** One line of a habit's or goal's numbers, the same ones its own page shows. */
export function overviewLine({ unit, current, best, recentLabel, recent }: HistoryStats): string {
  const percent = ratePercent(recent);
  return `${countLabel(current, unit)} now · Best ${countLabel(best, unit)} · ${recentLabel} ${
    percent === null ? '—' : `${percent}%`
  }`;
}

/** Every active habit and weekly goal (no to-dos), in list order then their order in the list. */
export function buildOverview(input: {
  lists: readonly List[];
  items: readonly Item[];
  completionDays: Readonly<Record<string, readonly string[]>>;
  targets: Readonly<Record<string, readonly TargetPoint[]>>;
  today: string;
}): Overview {
  const { lists, items, completionDays, targets, today } = input;
  const rows: OverviewRow[] = [];
  const allDays: string[] = [];
  for (const list of [...lists].sort((a, b) => a.order - b.order)) {
    const recurring = items
      .filter((item) => item.listId === list.id && item.type !== 'todo')
      .sort((a, b) => a.order - b.order);
    for (const item of recurring) {
      const days = completionDays[item.id] ?? [];
      allDays.push(...days);
      const stats = historyStats(item.type as 'daily' | 'weekly', days, targets[item.id] ?? [], today);
      rows.push({ item, list, stats, line: overviewLine(stats) });
    }
  }
  return { rows, counts: dayCounts(allDays) };
}

/** "Last 6 months: 4 check-ins across 2 habits and goals". */
export function overviewHeatmapLabel(
  weeks: readonly (readonly string[])[],
  counts: ReadonlyMap<string, number>,
  today: string,
  habits: number,
): string {
  let checkIns = 0;
  for (const day of weeks.flat()) if (day <= today) checkIns += counts.get(day) ?? 0;
  const across = habits === 1 ? '1 habit or goal' : `${habits} habits and goals`;
  return `Last 6 months: ${countLabel(checkIns, 'check-in')} across ${across}`;
}
