import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDb } from './db';
import { newId } from './ids';

describe('createDb', () => {
  it('declares every table the later slices need', async () => {
    const db = createDb('schema-test');
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'completions',
      'items',
      'lists',
      'meta',
      'targetHistory',
    ]);
    expect(db.completions.schema.idxByName['[itemId+dayKey]']).toBeDefined();
    db.close();
  });

  it('defaults to the production database name', () => {
    expect(createDb().name).toBe('habit-tracker');
  });
});

describe('newId', () => {
  it('returns unique UUIDs', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  });
});
