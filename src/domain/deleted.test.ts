import { describe, expect, it } from 'vitest';
import {
  deleteForeverQuestion,
  deletedRows,
  emptyQuestion,
  restoreTarget,
  type ArchivedItem,
} from './deleted';
import type { List } from './lists';

const list = (id: string, name: string, order: number): List => ({
  id,
  name,
  emoji: '📚',
  color: 'teal',
  order,
});
const lists = [list('fit', 'Fitness', 0), list('me', 'Personal', 1)];
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const deleted = (id: string, type: ArchivedItem['type'], listId: string, archivedAt: number): ArchivedItem => ({
  id,
  title: id,
  type,
  listId,
  order: 0,
  archivedAt,
});

describe('deletedRows', () => {
  it('lists deleted items newest first with what they were, their list and when', () => {
    const rows = deletedRows(
      [
        deleted('Meditate', 'daily', 'me', at(2026, 10, 12)),
        deleted('Call mom', 'todo', 'me', at(2026, 10, 13)),
        deleted('Peloton ride', 'weekly', 'gone', at(2025, 12, 30)),
      ],
      lists,
      '2026-10-14',
    );
    expect(rows.map((row) => [row.item.id, row.detail])).toEqual([
      ['Call mom', 'To-do · Personal · Deleted Oct 13'],
      ['Meditate', 'Daily habit · Personal · Deleted Oct 12'],
      ['Peloton ride', 'Weekly goal · Deleted list · Deleted Dec 30, 2025'],
    ]);
  });

  it('is empty with nothing deleted', () => {
    expect(deletedRows([], lists, '2026-10-14')).toEqual([]);
  });
});

describe('permanent-delete questions', () => {
  it('say what goes and that it cannot be undone', () => {
    expect(deleteForeverQuestion('Meditate')).toBe(
      "Delete “Meditate” for good? Its history goes too. This can't be undone.",
    );
    expect(emptyQuestion(3)).toBe(
      "Delete all 3 items for good? Their history goes too. This can't be undone.",
    );
    expect(emptyQuestion(1)).toBe(
      "Delete all 1 item for good? Their history goes too. This can't be undone.",
    );
  });
});

describe('restoreTarget', () => {
  it('goes back to its own list', () => {
    expect(restoreTarget(deleted('x', 'daily', 'me', 1), lists)).toEqual({ listId: 'me', movedTo: null });
  });

  it('goes to the first list when its own list is gone', () => {
    const shuffled = [list('me', 'Personal', 3), list('fit', 'Fitness', 1)];
    expect(restoreTarget(deleted('x', 'daily', 'gone', 1), shuffled)).toEqual({
      listId: 'fit',
      movedTo: 'Fitness',
    });
  });

  it('has nowhere to go without lists', () => {
    expect(restoreTarget(deleted('x', 'daily', 'gone', 1), [])).toBeNull();
  });
});
