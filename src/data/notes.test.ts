import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { NOTE_TOO_LONG } from '../domain/items';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import { createAssistantRepo } from './assistant-repo';
import { createBackupRepo } from './backup-repo';
import { createDb } from './db';
import { createItemsRepo } from './items-repo';
import { createListsRepo } from './lists-repo';

let dbCounter = 0;
const NOW = new Date(2026, 9, 30, 9, 0).getTime();

/** Fixture lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function setup() {
  const db = createDb(`notes-${++dbCounter}`);
  let n = 0;
  const lists = createListsRepo(db, { newId: () => `list-${++n}`, starters: FIXTURE_LISTS });
  const items = createItemsRepo(db, { newId: () => `item-${++n}`, now: () => NOW });
  const assistant = createAssistantRepo(db, { newId: () => `new-${++n}` });
  await lists.ensureStarterLists();
  return { db, items, assistant, backup: createBackupRepo(db) };
}

const paint = { title: 'Buy paint', listId: 'list-4', type: 'todo' };
const stored = async (db: Awaited<ReturnType<typeof setup>>['db'], id: string) => db.items.get(id);

describe('to-do notes in storage', () => {
  it('saves a to-do with its note, and none for a blank one', async () => {
    const { items, db } = await setup();
    const made = await items.create({ ...paint, note: '  the blue one  ' });
    expect(made.ok && made.value.note).toBe('the blue one');
    const blank = await items.create({ ...paint, title: 'Pay rent', note: '   ' });
    expect(blank.ok && 'note' in (await stored(db, blank.value.id))!).toBe(false);
  });

  it('changes and clears the note, and leaves it alone when no note is given', async () => {
    const { items, db } = await setup();
    const made = await items.create({ ...paint, note: 'next week' });
    const id = made.ok ? made.value.id : '';

    await items.update(id, { ...paint, note: 'after the 5th' });
    expect((await stored(db, id))?.note).toBe('after the 5th');
    await items.update(id, { ...paint });
    expect((await stored(db, id))?.note).toBe('after the 5th');
    await items.update(id, { ...paint, note: '' });
    expect('note' in (await stored(db, id))!).toBe(false);
  });

  it('refuses a note over the limit without saving', async () => {
    const { items, db } = await setup();
    expect(await items.create({ ...paint, note: 'x'.repeat(201) })).toEqual({ ok: false, error: NOTE_TOO_LONG });
    expect(await db.items.count()).toBe(0);
  });

  it('keeps the note through a change to a habit and back', async () => {
    const { items, db } = await setup();
    const made = await items.create({ ...paint, title: 'Fix bike', note: 'chain is loose' });
    const id = made.ok ? made.value.id : '';
    await items.update(id, { title: 'Fix bike', listId: 'list-4', type: 'daily' });
    expect((await stored(db, id))?.note).toBe('chain is loose');
    const back = await items.update(id, { title: 'Fix bike', listId: 'list-4', type: 'todo' });
    expect(back.ok && back.value.note).toBe('chain is loose');
  });

  it('keeps notes through a backup and restore', async () => {
    const { items, backup, db } = await setup();
    await items.create({ ...paint, note: 'the blue one' });
    const data = await backup.read();
    expect(data.ok && data.value.items[0]!.note).toBe('the blue one');
    await db.items.clear();
    await backup.restore(data.ok ? data.value : (undefined as never));
    expect((await db.items.toArray())[0]?.note).toBe('the blue one');
  });
});

describe('notes from the assistant in storage', () => {
  const incoming = (id: string, note?: string) => ({ id, title: 'Pay the plumber', list: 'Work', due: undefined, note });

  it('saves the note with the to-do', async () => {
    const { assistant, db } = await setup();
    expect(await assistant.save([incoming('t1', 'next week')])).toEqual({ ok: true, value: { ids: ['t1'], added: 1 } });
    const [saved] = await db.items.where('assistantId').equals('t1').toArray();
    expect(saved).toMatchObject({ title: 'Pay the plumber', note: 'next week' });
    expect(saved?.dueDate).toBeUndefined();
  });

  it('keeps the first note when the same to-do comes again', async () => {
    const { assistant, db } = await setup();
    await assistant.save([incoming('t1', 'next week')]);
    await assistant.save([incoming('t1', 'tomorrow')]);
    const saved = await db.items.where('assistantId').equals('t1').toArray();
    expect(saved.map((item) => item.note)).toEqual(['next week']);
  });

  it('saves no note field when none was sent', async () => {
    const { assistant, db } = await setup();
    await assistant.save([incoming('t2')]);
    const [saved] = await db.items.where('assistantId').equals('t2').toArray();
    expect('note' in saved!).toBe(false);
  });
});
