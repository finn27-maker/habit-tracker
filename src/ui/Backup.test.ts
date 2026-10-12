import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { BACKUP_READ_ERROR } from '../data/backup-repo';
import { SAVE_ERROR } from '../data/errors';
import {
  BACKUP_TOO_LARGE,
  MAX_BACKUP_BYTES,
  NOT_A_BACKUP,
  createBackup,
  type BackupData,
} from '../domain/backup';
import type { ShareEnv } from '../platform/share';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 14, 9, 0);
const setup = () => setupApp(NOW, 'backup-ui');

function renderLists(ctx: AppCtx, share: ShareEnv = ctx.share) {
  location.hash = '#/lists';
  return render(Router, { props: { ...routerProps(ctx), share } });
}

const exportButton = () => screen.findByRole('button', { name: 'Export backup' });
const backupSection = () => screen.getByRole('region', { name: 'Backup' });
const readyToExport = async () => waitFor(async () => expect(await exportButton()).toBeEnabled());

const restoredData: BackupData = {
  lists: [{ id: 'r1', name: 'Reading', emoji: '📚', color: 'teal', order: 0 }],
  items: [
    { id: 'h1', listId: 'r1', type: 'daily', title: 'Meditate', order: 0 },
    { id: 't1', listId: 'r1', type: 'todo', title: 'Return book', order: 1 },
  ],
  completions: ['2026-10-12', '2026-10-13', '2026-10-14'].map((dayKey, i) => ({
    id: `c${i}`,
    itemId: 'h1',
    dayKey,
    createdAt: i,
  })),
  targetHistory: [],
};
const backupFile = (data = restoredData, made = new Date(2026, 9, 12, 20, 0)) =>
  new File([JSON.stringify(createBackup(data, made))], 'habit-tracker-backup-2026-10-12.json', {
    type: 'application/json',
  });

async function choose(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  await fireEvent.change(input, { target: { files: [file] } });
}

const storedListNames = async (ctx: AppCtx) => (await ctx.db.lists.orderBy('order').toArray()).map((l) => l.name);

describe('export', () => {
  it('sits at the bottom of the Lists tab and starts with no backup', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();

    const section = backupSection();
    expect(within(section).getByRole('heading', { level: 2, name: 'Backup' })).toBeInTheDocument();
    expect(section).toHaveTextContent('Last backup: Never');
    expect(within(section).getByRole('button', { name: 'Restore from file' })).toBeInTheDocument();
  });

  it('shares a dated file holding everything, then shows the backup date', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
    await ctx.itemsRepo.toggleDay('item-1', '2026-10-14');
    renderLists(ctx);
    await readyToExport();

    await fireEvent.click(await exportButton());

    await waitFor(() => expect(backupSection()).toHaveTextContent('Last backup: Oct 14, 2026'));
    expect(ctx.shared).toHaveLength(1);
    const file = ctx.shared[0]!;
    expect(file.name).toBe('habit-tracker-backup-2026-10-14.json');
    expect(file.type).toBe('application/json');
    const backup = JSON.parse(await file.text());
    expect(backup.app).toBe('habit-tracker');
    expect(backup.data.lists).toHaveLength(4);
    expect(backup.data.items).toHaveLength(1);
    expect(backup.data.completions).toHaveLength(1);
    expect(await ctx.backupRepo.status()).toEqual({
      ok: true,
      value: { lastBackupAt: NOW.getTime(), snoozedUntil: null },
    });
  });

  it('downloads when sharing files is not possible or is refused', async () => {
    const ctx = setup();
    const refused = {
      canShare: () => true,
      share: async () => {
        throw new DOMException('no', 'NotAllowedError');
      },
      download: vi.fn(),
    };
    renderLists(ctx, refused);
    await readyToExport();

    await fireEvent.click(await exportButton());

    await waitFor(() => expect(refused.download).toHaveBeenCalledTimes(1));
    expect(refused.download.mock.calls[0]![0].name).toBe('habit-tracker-backup-2026-10-14.json');
    await waitFor(() => expect(backupSection()).toHaveTextContent('Last backup: Oct 14, 2026'));
  });

  it('does not count a closed share sheet as a backup', async () => {
    const ctx = setup();
    const closed = {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('closed', 'AbortError');
      }),
      download: vi.fn(),
    };
    renderLists(ctx, closed);
    await readyToExport();

    await fireEvent.click(await exportButton());

    await waitFor(() => expect(closed.share).toHaveBeenCalled());
    expect(backupSection()).toHaveTextContent('Last backup: Never');
    expect(closed.download).not.toHaveBeenCalled();
    expect(within(backupSection()).queryByRole('status')).toBeNull();
  });

  it('says so when the backup cannot be prepared', async () => {
    const ctx = setup();
    const broken = { ...ctx.backupRepo, read: async () => ({ ok: false as const, error: BACKUP_READ_ERROR }) };
    location.hash = '#/lists';
    render(Router, { props: { ...routerProps(ctx), backupRepo: broken } });

    expect(await screen.findByText(BACKUP_READ_ERROR)).toBeInTheDocument();
    expect(await exportButton()).toBeDisabled();
  });

  it('reports a backup date that could not be saved', async () => {
    const ctx = setup();
    const failing = {
      ...ctx.backupRepo,
      markBackedUp: async () => ({ ok: false as const, error: SAVE_ERROR }),
    };
    location.hash = '#/lists';
    render(Router, { props: { ...routerProps(ctx), backupRepo: failing } });
    await readyToExport();

    await fireEvent.click(await exportButton());

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(backupSection()).toHaveTextContent('Last backup: Never');
  });
});

describe('restore', () => {
  it('shows what the file holds and changes nothing until Replace', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();

    await choose(backupFile());

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      "Replace everything on this phone with the backup from Oct 12, 2026? It has 1 list, 1 habit or goal, 1 to-do and 3 check-ins. What's on this phone now will be lost.",
    );
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Cancel',
      'Replace',
    ]);
    expect(await storedListNames(ctx)).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await storedListNames(ctx)).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
  });

  it('replaces everything on Replace and shows the restored data', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();

    await choose(backupFile());
    await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }));

    expect(await screen.findByText('Restored the backup from Oct 12, 2026.')).toBeInTheDocument();
    expect(await storedListNames(ctx)).toEqual(['Reading']);
    expect(await screen.findByText('Reading')).toBeInTheDocument();
    expect(screen.queryByText('Fitness')).toBeNull();

    location.hash = '#/today';
    expect(await screen.findByRole('img', { name: '3 day streak' })).toBeInTheDocument();
  });

  it.each([
    ['plain text', new File(['hello'], 'notes.txt'), NOT_A_BACKUP],
    ['a JSON file from another app', new File([JSON.stringify({ app: 'other' })], 'x.json'), NOT_A_BACKUP],
  ])('refuses %s with a message', async (_what, file, message) => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();
    await choose(file);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('refuses a file over 20 MB without reading it', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();
    const huge = new File(['{}'], 'huge.json');
    Object.defineProperty(huge, 'size', { value: MAX_BACKUP_BYTES + 1 });
    const read = vi.spyOn(huge, 'text');

    await choose(huge);

    expect(await screen.findByText(BACKUP_TOO_LARGE)).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps the old data and says so when the restore cannot be saved', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();
    await choose(backupFile());
    const dialog = await screen.findByRole('alertdialog');
    ctx.db.close();

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
  });

  it('shows restored names as plain text', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();
    const evil = { ...restoredData, lists: [{ ...restoredData.lists[0]!, name: '<img src=x onerror=alert(1)>' }] };

    await choose(backupFile(evil));
    await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }));

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('ignores a picker closed without a file', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    await fireEvent.change(input, { target: { files: [] } });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(backupSection()).queryByRole('status')).toBeNull();
  });

  it('opens the file picker from the Restore button', async () => {
    const ctx = setup();
    renderLists(ctx);
    await readyToExport();
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const click = vi.spyOn(input, 'click');
    await fireEvent.click(screen.getByRole('button', { name: 'Restore from file' }));
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('reminder banner', () => {
  const banner = () => screen.queryByRole('complementary', { name: 'Backup reminder' });

  async function withHabit(ctx: AppCtx) {
    await ctx.listsRepo.ensureStarterLists();
    await ctx.itemsRepo.create({ title: 'Meditate', listId: 'list-4', type: 'daily' });
  }

  it('suggests a first backup once there is something to save', async () => {
    const ctx = setup();
    await withHabit(ctx);
    renderLists(ctx);
    await waitFor(() => expect(banner()).toHaveTextContent("You haven't backed up yet."));
  });

  it('reminds after more than 30 days, and not with nothing to save or a recent backup', async () => {
    const overdue = setup();
    await withHabit(overdue);
    await overdue.backupRepo.markBackedUp(NOW.getTime() - 31 * DAY);
    const first = renderLists(overdue);
    await waitFor(() =>
      expect(banner()).toHaveTextContent("It's been over 30 days since your last backup."),
    );
    first.unmount();

    const recent = setup();
    await withHabit(recent);
    await recent.backupRepo.markBackedUp(NOW.getTime() - 24 * DAY);
    const second = renderLists(recent);
    await readyToExport();
    expect(banner()).toBeNull();
    second.unmount();

    const empty = setup();
    renderLists(empty);
    await readyToExport();
    expect(banner()).toBeNull();
  });

  it('hides for 7 days after "Not now"', async () => {
    const ctx = setup();
    await withHabit(ctx);
    renderLists(ctx);
    await waitFor(() => expect(banner()).not.toBeNull());

    await fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    await waitFor(() => expect(banner()).toBeNull());
    expect(await ctx.backupRepo.status()).toEqual({
      ok: true,
      value: { lastBackupAt: null, snoozedUntil: NOW.getTime() + 7 * DAY },
    });
  });

  it('reports a snooze that could not be saved', async () => {
    const ctx = setup();
    await withHabit(ctx);
    const failing = { ...ctx.backupRepo, snooze: async () => ({ ok: false as const, error: SAVE_ERROR }) };
    location.hash = '#/lists';
    render(Router, { props: { ...routerProps(ctx), backupRepo: failing } });
    await waitFor(() => expect(banner()).not.toBeNull());

    await fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(banner()).not.toBeNull();
  });

  it('backs up from "Back up now" and then goes away', async () => {
    const ctx = setup();
    await withHabit(ctx);
    renderLists(ctx);
    await waitFor(() => expect(banner()).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());

    await fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));

    await waitFor(() => expect(banner()).toBeNull());
    expect(ctx.shared).toHaveLength(1);
  });
});
