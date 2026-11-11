import { describe, expect, it } from 'vitest';
import { parseTodos } from './assistant';
import { parseBackup } from './backup';

const read = (fields: Record<string, unknown>) =>
  parseTodos({ version: 1, todos: [{ id: 't1', title: 'Order signage', list: 'work', due: null, ...fields }] });

describe('business fields on assistant to-dos', () => {
  it('reads business_id and a trimmed business_name', () => {
    expect(read({ business_id: 'lxthrgarage', business_name: '  Lxthr Garage ' })[0]).toMatchObject({
      list: 'work',
      business: { id: 'lxthrgarage', name: 'Lxthr Garage' },
    });
  });

  it('uses the business id as the name when there is none', () => {
    expect(read({ business_id: 'mwcn' })[0]!.business).toEqual({ id: 'mwcn', name: 'mwcn' });
    expect(read({ business_id: 'mwcn', business_name: '   ' })[0]!.business).toEqual({ id: 'mwcn', name: 'mwcn' });
    expect(read({ business_id: 'mwcn', business_name: 7 })[0]!.business).toEqual({ id: 'mwcn', name: 'mwcn' });
  });

  it('shortens a name longer than 40 characters to 39 and an ellipsis', () => {
    const name = read({ business_id: 'long', business_name: 'x'.repeat(60) })[0]!.business!.name;
    expect(name).toBe(`${'x'.repeat(39)}…`);
    expect(name).toHaveLength(40);
  });

  it('ignores an invalid business id and keeps the to-do with its list name', () => {
    for (const business_id of ['bad id!', '', 'x'.repeat(65), 42, null]) {
      const [parsed] = read({ business_id, business_name: 'Nope' });
      expect(parsed).toMatchObject({ id: 't1', list: 'work' });
      expect(parsed).not.toHaveProperty('business');
    }
  });

  it('leaves the field out when Scribe sends no business', () => {
    expect(read({})[0]).not.toHaveProperty('business');
  });
});

describe('business links in backups', () => {
  const file = (list: Record<string, unknown>) =>
    JSON.stringify({
      app: 'habit-tracker',
      version: 1,
      exportedAt: '2026-11-04T00:00:00.000Z',
      data: {
        lists: [{ id: 'l1', name: 'Garage', emoji: '🚗', color: 'orange', order: 0, ...list }],
        items: [],
        completions: [],
        targetHistory: [],
      },
    });

  it('restores a list with its business link', () => {
    expect(parseBackup(file({ businessId: 'lxthrgarage' }))).toMatchObject({
      ok: true,
      value: { data: { lists: [{ id: 'l1', businessId: 'lxthrgarage' }] } },
    });
  });

  it('restores a list shared by several businesses', () => {
    expect(parseBackup(file({ businessIds: ['mwcn', 'wta'] }))).toMatchObject({
      ok: true,
      value: { data: { lists: [{ id: 'l1', businessIds: ['mwcn', 'wta'] }] } },
    });
  });

  it('refuses a damaged list of businesses', () => {
    expect(parseBackup(file({ businessIds: 'mwcn' })).ok).toBe(false);
    expect(parseBackup(file({ businessIds: ['mwcn', ''] })).ok).toBe(false);
    expect(parseBackup(file({ businessIds: [3] })).ok).toBe(false);
  });

  it('restores a list from an older backup with no link', () => {
    const parsed = parseBackup(file({}));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.data.lists[0]).not.toHaveProperty('businessId');
  });

  it('refuses a damaged link', () => {
    expect(parseBackup(file({ businessId: 5 })).ok).toBe(false);
    expect(parseBackup(file({ businessId: '' })).ok).toBe(false);
  });
});
