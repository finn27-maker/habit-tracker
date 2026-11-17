import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createBackupRepo } from '../data/backup-repo';
import { SAVE_ERROR } from '../data/errors';
import { NOT_A_BACKUP, createBackup, type BackupData } from '../domain/backup';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

const NOW = new Date(2026, 10, 14, 9, 0);
const setup = () => setupApp(NOW, 'partial-restore');
const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';

function renderLists(ctx: AppCtx) {
  location.hash = '#/lists';
  return render(Router, { props: routerProps(ctx) });
}

const fileOf = (data: BackupData) =>
  new File([JSON.stringify(createBackup(data, new Date(2026, 10, 10, 20, 0)))], 'habit-tracker-backup-2026-11-10.json', {
    type: 'application/json',
  });

async function choose(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  await fireEvent.change(input, { target: { files: [file] } });
}

const sheet = () => screen.findByRole('dialog', { name: 'Restore from backup (Nov 10, 2026)' });
const row = async (name: string) => within(await sheet()).getByRole('checkbox', { name: new RegExp(name) });

/**
 * Fixture lists: list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal.
 * Takes a backup, then loses "Stretch" (with its check-ins) and "Pay rent", renames
 * "Call the bank" and checks it off, and loses the whole "Side Business" list.
 */
async function seed(ctx: AppCtx) {
  await ctx.listsRepo.ensureStarterLists();
  const add = async (title: string, listId: string, type = 'todo') => {
    const made = await ctx.itemsRepo.create({ title, listId, type, target: 3 });
    if (!made.ok) throw new Error(made.error);
    return made.value.id;
  };
  const stretch = await add('Stretch', 'list-1', 'daily');
  await ctx.itemsRepo.toggleDay(stretch, '2026-11-08');
  await ctx.itemsRepo.toggleDay(stretch, '2026-11-09');
  const call = await add('Call the bank', 'list-2');
  const rent = await add('Pay rent', 'list-2');
  const side = await add('Side habit', 'list-3', 'daily');
  const read = await createBackupRepo(ctx.db).read();
  if (!read.ok) throw new Error(read.error);
  const backup = read.value;

  await ctx.db.items.bulkDelete([stretch, rent, side]);
  await ctx.db.completions.where('itemId').equals(stretch).delete();
  await ctx.db.lists.delete('list-3');
  await ctx.itemsRepo.update(call, { title: 'Call the bank today', listId: 'list-2' });
  await ctx.itemsRepo.setTodoDone(call, true);
  return { backup, call };
}

describe('the pick sheet', () => {
  it('lists the backup lists with what each would add back', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    renderLists(ctx);
    await choose(fileOf(backup));

    const dialog = await sheet();
    expect(within(dialog).getByText('Fitness').closest('label')).toHaveTextContent('1 to add back (2 check-ins)');
    expect(within(dialog).getByText('Work').closest('label')).toHaveTextContent('1 to add back');
    expect(within(dialog).getByText('Side Business').closest('label')).toHaveTextContent('deleted list · 1 to add back');
    expect(await row('Personal')).toBeDisabled();
    expect(within(dialog).getByText('Personal').closest('label')).toHaveTextContent('nothing missing');
    expect(within(dialog).getByRole('button', { name: 'Add back' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Replace everything instead' })).toBeInTheDocument();
  });

  it('counts the ticked lists on the button', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    renderLists(ctx);
    await choose(fileOf(backup));

    await fireEvent.click(await row('Fitness'));
    expect(within(await sheet()).getByRole('button', { name: 'Add back 1 item' })).toBeEnabled();
    await fireEvent.click(await row('Work'));
    expect(within(await sheet()).getByRole('button', { name: 'Add back 2 items' })).toBeEnabled();
    await fireEvent.click(await row('Work'));
    expect(within(await sheet()).getByRole('button', { name: 'Add back 1 item' })).toBeEnabled();
  });

  it('adds back what is missing and changes nothing on the phone', async () => {
    const ctx = setup();
    const { backup, call } = await seed(ctx);
    renderLists(ctx);
    await choose(fileOf(backup));

    await fireEvent.click(await row('Fitness'));
    await fireEvent.click(await row('Work'));
    await fireEvent.click(await row('Side Business'));
    await fireEvent.click(within(await sheet()).getByRole('button', { name: 'Add back 3 items' }));

    expect(await screen.findByText('Added back 3 items from the backup of Nov 10, 2026.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    const titles = (await ctx.db.items.toArray()).map((item) => item.title).sort();
    expect(titles).toEqual(['Call the bank today', 'Pay rent', 'Side habit', 'Stretch']);
    expect(await ctx.db.completions.count()).toBe(2);
    expect((await ctx.db.lists.get('list-3'))?.name).toBe('Side Business');
    const kept = await ctx.db.items.get(call);
    expect(kept).toMatchObject({ title: 'Call the bank today', completedAt: expect.any(Number) });
    await waitFor(() => expect(screen.getByRole('link', { name: /Side Business/ })).toBeInTheDocument());
  });

  it('keeps Replace everything one tap away', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    renderLists(ctx);
    await choose(fileOf(backup));

    await fireEvent.click(within(await sheet()).getByRole('button', { name: 'Replace everything instead' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Replace everything on this phone with the backup from Nov 10, 2026?',
    );
  });

  it('changes nothing on Cancel', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    renderLists(ctx);
    const before = await ctx.db.items.count();
    await choose(fileOf(backup));

    await fireEvent.click(within(await sheet()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await ctx.db.items.count()).toBe(before);
  });

  it('adds nothing and says so when it cannot be saved', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    renderLists(ctx);
    await choose(fileOf(backup));
    await fireEvent.click(await row('Fitness'));
    ctx.db.close();

    await fireEvent.click(within(await sheet()).getByRole('button', { name: 'Add back 1 item' }));
    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
  });

  it('opens no sheet for a file that is not a backup', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderLists(ctx);
    await choose(new File(['not json'], 'notes.json', { type: 'application/json' }));

    expect(await screen.findByText(NOT_A_BACKUP)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows list names as plain text in the sheet', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    const evil = { ...backup, lists: backup.lists.map((l) => (l.id === 'list-3' ? { ...l, name: '<img src=x onerror=alert(1)>' } : l)) };
    const { container } = renderLists(ctx);
    await choose(fileOf(evil));

    expect(within(await sheet()).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('img[src="x"]')).toBeNull();
  });

  it('never touches the assistant pairing', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    await ctx.assistantRepo.pair(CODE);
    renderLists(ctx);
    await choose(fileOf(backup));
    await fireEvent.click(await row('Fitness'));
    await fireEvent.click(within(await sheet()).getByRole('button', { name: 'Add back 1 item' }));

    await screen.findByText('Added back 1 item from the backup of Nov 10, 2026.');
    expect(await ctx.assistantRepo.code()).toBe(CODE);
    expect(await ctx.assistantRepo.status()).toMatchObject({ value: { connected: true } });
  });
});

describe('addBack in storage', () => {
  it('skips anything that appeared on the phone in the meantime', async () => {
    const ctx = setup();
    const { backup } = await seed(ctx);
    const repo = createBackupRepo(ctx.db);
    const stretch = backup.items.find((item) => item.title === 'Stretch')!;
    const additions: BackupData = {
      lists: backup.lists.filter((l) => l.id === 'list-1'),
      items: [stretch],
      completions: backup.completions,
      targetHistory: [
        { itemId: stretch.id, effectiveWeekStart: '2026-11-08', target: 3 },
        { itemId: 'not-added', effectiveWeekStart: '2026-11-08', target: 2 },
      ],
    };

    expect(await repo.addBack(additions)).toEqual({ ok: true, value: 1 });
    expect(await ctx.db.targetHistory.where('itemId').equals(stretch.id).count()).toBe(1);
    expect(await ctx.db.targetHistory.where('itemId').equals('not-added').count()).toBe(0);
    expect(await repo.addBack(additions)).toEqual({ ok: true, value: 0 });
    expect((await ctx.db.items.toArray()).filter((i) => i.title === 'Stretch')).toHaveLength(1);
    expect(await ctx.db.completions.count()).toBe(2);
  });
});
