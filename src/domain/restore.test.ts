import { describe, expect, it } from 'vitest';
import type { BackupData, BackupItem, BackupList } from './backup';
import {
  addBackButton,
  addedBackMessage,
  canAddBack,
  restoreAdditions,
  restoreListLabel,
  restorePlan,
} from './restore';

const list = (id: string, name: string, order: number, extra: Partial<BackupList> = {}): BackupList => ({
  id,
  name,
  emoji: '📋',
  color: 'blue',
  order,
  ...extra,
});
const item = (id: string, listId: string, order: number, extra: Partial<BackupItem> = {}): BackupItem => ({
  id,
  listId,
  type: 'todo',
  title: id,
  order,
  ...extra,
});
const data = (partial: Partial<BackupData>): BackupData => ({
  lists: [],
  items: [],
  completions: [],
  targetHistory: [],
  ...partial,
});
const checkIns = (itemId: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${itemId}-c${i}`, itemId, dayKey: '2026-10-01', createdAt: i }));

// The backup from Nov 10: KeyBank (3 to-dos the phone lacks, 1 it has), Personal (nothing
// missing), Fitness (habit Stretch with 212 check-ins), Side Hustle (deleted on the phone).
const backup = data({
  lists: [
    list('kb', 'KeyBank', 0),
    list('me', 'Personal', 1),
    list('fit', 'Fitness', 2),
    list('side', 'Side Hustle', 3, { businessIds: ['side'] }),
  ],
  items: [
    item('call', 'kb', 0),
    item('t1', 'kb', 3),
    item('t2', 'kb', 1),
    item('t3', 'kb', 2),
    item('old', 'kb', 4),
    item('gone', 'kb', 5, { archivedAt: 1 }),
    item('xcel', 'kb', 6, { assistantId: 'a-1' }),
    item('mine', 'me', 0),
    item('stretch', 'fit', 0, { type: 'daily' }),
    item('h1', 'side', 0, { type: 'daily' }),
    item('h2', 'side', 1, { type: 'weekly' }),
  ],
  completions: [...checkIns('stretch', 212), ...checkIns('h2', 2), ...checkIns('call', 1)],
  targetHistory: [{ itemId: 'h2', effectiveWeekStart: '2026-09-27', target: 3 }],
});
const phone = data({
  lists: [list('kb', 'KeyBank', 0), list('me', 'Personal', 1), list('fit', 'Fitness', 2, { businessIds: ['side'] })],
  items: [
    item('call', 'kb', 0, { title: 'Call the bank (renamed)', completedAt: 5 }),
    item('later', 'kb', 7),
    item('old', 'kb', 4, { archivedAt: 9 }),
    item('xcel-here', 'kb', 8, { assistantId: 'a-1' }),
    item('mine', 'me', 0),
  ],
  completions: [{ id: 'call-c0', itemId: 'call', dayKey: '2026-11-11', createdAt: 99 }],
});

describe('restorePlan', () => {
  it('lists every backup list with what it would add back', () => {
    expect(restorePlan(backup, phone)).toEqual([
      { id: 'kb', name: 'KeyBank', emoji: '📋', deleted: false, items: 3, checkIns: 0 },
      { id: 'me', name: 'Personal', emoji: '📋', deleted: false, items: 0, checkIns: 0 },
      { id: 'fit', name: 'Fitness', emoji: '📋', deleted: false, items: 1, checkIns: 212 },
      { id: 'side', name: 'Side Hustle', emoji: '📋', deleted: true, items: 2, checkIns: 2 },
    ]);
  });

  it('leaves out items in Recently deleted, deleted in the backup, or already delivered by the assistant', () => {
    const kb = restorePlan(backup, phone)[0]!;
    expect(kb.items).toBe(3); // t1, t2, t3 - not call, old (deleted on phone), gone (deleted in backup), xcel
  });

  it('says nothing is missing when everything is already there', () => {
    expect(restorePlan(backup, backup).every((row) => row.items === 0 && !row.deleted)).toBe(true);
  });
});

describe('restoreAdditions', () => {
  it('adds only the missing items of ticked lists, after their list, in backup order', () => {
    const added = restoreAdditions(backup, phone, ['kb']);
    expect(added.lists).toEqual([]);
    // The phone's KeyBank items go up to order 8 (the assistant to-do), so these follow it.
    expect(added.items.map((i) => [i.id, i.order])).toEqual([
      ['t2', 9],
      ['t3', 10],
      ['t1', 11],
    ]);
    expect(added.completions).toEqual([]);
  });

  it('brings the check-ins with an added habit, skipping any already on the phone', () => {
    const withClash = data({ ...phone, completions: [...phone.completions, { id: 'stretch-c0', itemId: 'x', dayKey: '2026-10-01', createdAt: 0 }] });
    const added = restoreAdditions(backup, withClash, ['fit']);
    expect(added.items.map((i) => i.id)).toEqual(['stretch']);
    expect(added.completions).toHaveLength(211);
  });

  it('brings a deleted list back after the phone lists, with its items, check-ins and targets', () => {
    const added = restoreAdditions(backup, phone, ['side']);
    expect(added.lists).toEqual([{ id: 'side', name: 'Side Hustle', emoji: '📋', color: 'blue', order: 3 }]);
    expect(added.items.map((i) => [i.id, i.order])).toEqual([
      ['h1', 0],
      ['h2', 1],
    ]);
    expect(added.completions).toHaveLength(2);
    expect(added.targetHistory).toEqual([{ itemId: 'h2', effectiveWeekStart: '2026-09-27', target: 3 }]);
  });

  it('keeps a returning list business links nobody else holds, and its own to-do order', () => {
    const free = data({ ...phone, lists: phone.lists.map((l) => ({ ...l, businessIds: undefined })) });
    const old = data({ ...backup, lists: backup.lists.map((l) => (l.id === 'side' ? { ...l, businessIds: undefined, businessId: 'side', manualTodoOrder: true } : l)) });
    expect(restoreAdditions(old, free, ['side']).lists[0]).toMatchObject({ businessIds: ['side'], manualTodoOrder: true });
  });

  it('starts at the top for a phone with no lists or items', () => {
    const added = restoreAdditions(backup, data({}), ['side']);
    expect(added.lists[0]!.order).toBe(0);
    expect(added.items[0]!.order).toBe(0);
  });

  it('adds nothing for nothing ticked or a list with nothing missing', () => {
    expect(restoreAdditions(backup, phone, [])).toEqual(data({}));
    expect(restoreAdditions(backup, phone, ['me'])).toEqual(data({}));
  });

  it('works out 500 items with 20,000 check-ins quickly', () => {
    const big = data({
      lists: [list('big', 'Big', 0)],
      items: Array.from({ length: 500 }, (_, i) => item(`b${i}`, 'big', i)),
      completions: Array.from({ length: 20000 }, (_, i) => ({ id: `c${i}`, itemId: `b${i % 500}`, dayKey: '2026-10-01', createdAt: i })),
    });
    const started = performance.now();
    const added = restoreAdditions(big, data({}), ['big']);
    const plan = restorePlan(big, data({}));
    expect(performance.now() - started).toBeLessThan(500);
    expect(added.items).toHaveLength(500);
    expect(plan[0]!.checkIns).toBe(20000);
  });
});

describe('labels', () => {
  const [kb, me, fit, side] = restorePlan(backup, phone);

  it('describes each list row', () => {
    expect(restoreListLabel(kb!)).toBe('3 to add back');
    expect(restoreListLabel(me!)).toBe('nothing missing');
    expect(restoreListLabel(fit!)).toBe('1 to add back (212 check-ins)');
    expect(restoreListLabel(side!)).toBe('deleted list · 2 to add back (2 check-ins)');
    expect(restoreListLabel({ ...side!, items: 0, checkIns: 0 })).toBe('deleted list');
    expect(restoreListLabel({ ...fit!, checkIns: 1 })).toBe('1 to add back (1 check-in)');
  });

  it('only lets lists with something to bring back be ticked', () => {
    expect([kb, me, fit, side].map((row) => canAddBack(row!))).toEqual([true, false, true, true]);
  });

  it('counts what is ticked on the button', () => {
    const plan = restorePlan(backup, phone);
    expect(addBackButton(plan, [])).toEqual({ text: 'Add back', enabled: false });
    expect(addBackButton(plan, ['me'])).toEqual({ text: 'Add back', enabled: false });
    expect(addBackButton(plan, ['kb', 'fit'])).toEqual({ text: 'Add back 4 items', enabled: true });
    expect(addBackButton(plan, ['fit'])).toEqual({ text: 'Add back 1 item', enabled: true });
    const emptyDeleted = plan.map((row) => (row.id === 'side' ? { ...row, items: 0 } : row));
    expect(addBackButton(emptyDeleted, ['side'])).toEqual({ text: 'Add back 1 list', enabled: true });
  });

  it('says what was added and from which backup', () => {
    const at = new Date(2026, 10, 10, 12).toISOString();
    expect(addedBackMessage(restoreAdditions(backup, phone, ['kb', 'fit']), at)).toBe(
      'Added back 4 items from the backup of Nov 10, 2026.',
    );
    expect(addedBackMessage(data({ lists: [list('x', 'X', 0)] }), at)).toBe('Added back 1 list from the backup of Nov 10, 2026.');
  });
});
