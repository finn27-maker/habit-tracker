import { describe, expect, it } from 'vitest';
import { heatmapWeeks, historyStats } from './history';
import type { Item } from './items';
import type { List } from './lists';
import { buildOverview, overviewHeatmapLabel, overviewLine } from './overview';

const TODAY = '2026-10-14';
const list = (id: string, order: number, name: string): List => ({
  id,
  name,
  emoji: '⭐',
  color: 'blue',
  order,
});
const item = (id: string, listId: string, type: Item['type'], order: number): Item => ({
  id,
  listId,
  type,
  title: id,
  order,
});

describe('overviewLine', () => {
  it('reads like the item page, with a dash when nothing is measured yet', () => {
    expect(
      overviewLine({
        unit: 'day',
        current: 3,
        best: 12,
        recentLabel: 'Last 30 days',
        recent: { done: 12, total: 30 },
        allTime: { done: 0, total: 0 },
        total: 0,
      }),
    ).toBe('3 days now · Best 12 days · Last 30 days 40%');
    expect(overviewLine(historyStats('daily', [], [], TODAY))).toBe(
      '0 days now · Best 0 days · Last 30 days —',
    );
    expect(overviewLine(historyStats('weekly', [], [{ effectiveWeekStart: '2026-10-11', target: 1 }], TODAY))).toMatch(
      /^0 weeks now · Best 0 weeks · Last 12 weeks /,
    );
  });
});

describe('buildOverview', () => {
  const lists = [list('work', 1, 'Work'), list('health', 0, 'Health')];
  const items = [
    item('Inbox zero', 'work', 'daily', 0),
    item('Gym', 'health', 'weekly', 1),
    item('Walk', 'health', 'daily', 0),
    item('Call mom', 'health', 'todo', 2),
  ];
  const completionDays = {
    Walk: ['2026-10-12', '2026-10-13'],
    Gym: ['2026-10-13', '2026-10-13'],
    'Call mom': ['2026-10-13'],
  };
  const targets = { Gym: [{ effectiveWeekStart: '2026-10-11', target: 3 }] };

  it('lists habits and goals by list order then item order, leaving out to-dos', () => {
    const { rows } = buildOverview({ lists, items, completionDays, targets, today: TODAY });
    expect(rows.map((row) => [row.item.title, row.list.name])).toEqual([
      ['Walk', 'Health'],
      ['Gym', 'Health'],
      ['Inbox zero', 'Work'],
    ]);
    expect(rows[0]!.line).toBe(overviewLine(historyStats('daily', completionDays.Walk, [], TODAY)));
    expect(rows[1]!.stats.unit).toBe('week');
  });

  it('counts check-ins per day across them all', () => {
    const { counts } = buildOverview({ lists, items, completionDays, targets, today: TODAY });
    expect(counts.get('2026-10-12')).toBe(1);
    expect(counts.get('2026-10-13')).toBe(3);
  });

  it('is empty with no habits or goals', () => {
    const overview = buildOverview({ lists, items: [], completionDays: {}, targets: {}, today: TODAY });
    expect(overview.rows).toEqual([]);
    expect(overview.counts.size).toBe(0);
  });
});

describe('overviewHeatmapLabel', () => {
  it('counts check-ins in the last six months, not future or older ones', () => {
    const weeks = heatmapWeeks(TODAY);
    const counts = new Map([
      ['2026-10-12', 1],
      ['2026-10-13', 3],
      ['2026-10-17', 2],
      ['2025-01-01', 5],
    ]);
    expect(overviewHeatmapLabel(weeks, counts, TODAY, 2)).toBe(
      'Last 6 months: 4 check-ins across 2 habits and goals',
    );
    expect(overviewHeatmapLabel(weeks, new Map([['2026-10-13', 1]]), TODAY, 1)).toBe(
      'Last 6 months: 1 check-in across 1 habit or goal',
    );
  });
});
