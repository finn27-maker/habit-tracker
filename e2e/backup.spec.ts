import { expect, test, type Page } from '@playwright/test';
import { completionCount } from './helpers';

type Shared = { name: string; type: string; text: string };

/** Replaces the share sheet with a recorder (or with "can't share files"). */
async function stubShare(page: Page, canShareFiles: boolean) {
  await page.addInitScript((can) => {
    const shared: Shared[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, 'canShare', { value: () => can, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        for (const file of data.files ?? []) {
          shared.push({ name: file.name, type: file.type, text: await file.text() });
        }
      },
    });
  }, canShareFiles);
}

const sharedFiles = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shared: Shared[] }).__shared);

async function addHabit(page: Page, name: string) {
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function openLists(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await expect(page.getByRole('button', { name: 'Export backup' })).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T09:00:00-05:00') });
});

test('a shared backup restores the data it was made from', async ({ page }) => {
  await stubShare(page, true);
  await page.goto('./');
  await addHabit(page, 'Meditate');
  await page.getByRole('checkbox', { name: 'Meditate' }).click();
  await expect.poll(() => completionCount(page)).toBe(1);

  await openLists(page);
  await expect(page.getByRole('complementary', { name: 'Backup reminder' })).toContainText(
    "You haven't backed up yet.",
  );
  await page.getByRole('button', { name: 'Export backup' }).click();
  await expect(page.getByRole('region', { name: 'Backup' })).toContainText('Last backup: Oct 14, 2026');
  await expect(page.getByRole('complementary', { name: 'Backup reminder' })).toHaveCount(0);
  const [file] = await sharedFiles(page);
  expect(file!.name).toBe('habit-tracker-backup-2026-10-14.json');
  expect(file!.type).toBe('application/json');

  // Change things after the backup: delete Meditate, add Stretch.
  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByRole('link', { name: 'Meditate details' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await addHabit(page, 'Stretch');

  await openLists(page);
  await page.locator('input[type=file]').setInputFiles({
    name: file!.name,
    mimeType: 'application/json',
    buffer: Buffer.from(file!.text),
  });
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(
    'Replace everything on this phone with the backup from Oct 14, 2026? It has 4 lists, 1 habit or goal, 0 to-dos and 1 check-in.',
  );
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByText('Restored the backup from Oct 14, 2026.')).toBeVisible();

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('checkbox', { name: 'Stretch' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('img', { name: '1 day streak' })).toBeVisible();
});

test('without file sharing the backup downloads instead', async ({ page }) => {
  await stubShare(page, false);
  await page.goto('./');
  await openLists(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  expect((await download).suggestedFilename()).toBe('habit-tracker-backup-2026-10-14.json');
  await expect(page.getByRole('region', { name: 'Backup' })).toContainText('Last backup: Oct 14, 2026');
  expect(await sharedFiles(page)).toEqual([]);
});

test('a file that is not a backup is refused and nothing changes', async ({ page }) => {
  await stubShare(page, true);
  await page.goto('./');
  await openLists(page);

  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByText("This file isn't a Habit Tracker backup.")).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.name')).toHaveText(['Fitness', 'Work', 'Side Business', 'Personal']);
});

test('backup controls are large enough, and Not now hides the reminder', async ({ page }) => {
  await stubShare(page, true);
  await page.goto('./');
  await addHabit(page, 'Meditate');
  await openLists(page);

  for (const name of ['Export backup', 'Restore from file', 'Back up now', 'Not now']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('complementary', { name: 'Backup reminder' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export backup' })).toBeEnabled();
  await expect(page.getByRole('complementary', { name: 'Backup reminder' })).toHaveCount(0);
});
