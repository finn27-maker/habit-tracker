import { expect, test, type Page } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

async function addItem(
  page: Page,
  name: string,
  kind: 'Daily habit' | 'Weekly goal' | 'To-do' = 'Daily habit',
  list = '⭐ Personal',
) {
  await startAdding(page, kind);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('List').selectOption({ label: list });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function deleteFromPage(page: Page, name: string) {
  await page.getByRole('link', { name: `${name} details` }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('a deleted habit comes back from Recently deleted with its check-in', async ({ page }) => {
  await addItem(page, 'Meditate');
  await page.getByRole('checkbox', { name: 'Meditate' }).click();
  await expect.poll(() => completionCount(page)).toBe(1);
  await deleteFromPage(page, 'Meditate');
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: 'Recently deleted' }).click();
  await expect(page).toHaveURL(/#\/deleted$/);
  await page.getByRole('button', { name: 'Restore Meditate' }).click();
  await expect(page.getByText('Restored “Meditate”.')).toBeVisible();

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute('aria-checked', 'true');
});

test('+ opens a to-do due today, and a name plus Save adds it', async ({ page }) => {
  // Measured inside the page: from the tap until the choice is on screen.
  const ms = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const started = performance.now();
        document.querySelector<HTMLButtonElement>('button[aria-label="Add"]')!.click();
        requestAnimationFrame(() =>
          resolve(document.querySelector('[role="dialog"]') ? performance.now() - started : Infinity),
        );
      }),
  );
  expect(ms).toBeLessThan(300);

  const dialog = page.getByRole('dialog', { name: 'New to-do' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'To-do', exact: true })).toBeChecked();
  for (const kind of ['To-do', 'Daily habit', 'Weekly goal']) {
    const box = (await dialog.getByRole('radio', { name: kind, exact: true }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
  }
  await expect(dialog.getByLabel('Due')).toHaveValue('today');
  await expect(dialog.getByLabel('Name')).toBeFocused();

  // A quick task: type and save, nothing else.
  await page.keyboard.type('Pick up dry cleaning');
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Pick up dry cleaning' });
  await expect(row).toContainText('Today');
  await page.getByRole('button', { name: 'Edit Pick up dry cleaning' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit to-do' })).toBeVisible();
  // Edit shows the Type switch too (s13), set to what the item is.
  await expect(page.getByRole('radio', { name: 'To-do', exact: true })).toBeChecked();
});

// Recorded, with only a pathological slowdown failing: CI runners' WebKit storage is several
// times slower than a Mac's, and neither is an iPhone (see the restore test in backup.spec.ts).
test('500 deleted items all show, and Empty removes them with their history', async ({
  page,
}, testInfo) => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['items', 'completions'], 'readwrite');
          for (let i = 0; i < 500; i += 1) {
            tx.objectStore('items').put({
              id: `old-${i}`,
              listId: 'gone',
              type: 'daily',
              title: `Old ${i}`,
              order: i,
              archivedAt: i,
            });
            for (let d = 0; d < 40; d += 1) {
              const dayKey = `2025-${String(1 + (d % 12)).padStart(2, '0')}-${String(1 + d).padStart(2, '0')}`;
              tx.objectStore('completions').put({ id: `c-${i}-${d}`, itemId: `old-${i}`, dayKey, createdAt: d });
            }
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  const started = Date.now();
  await page.goto('./#/deleted');
  await expect(page.getByRole('button', { name: /^Restore / })).toHaveCount(500);
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'deleted-500-ms', description: String(ms) });
  expect(ms).toBeLessThan(5000);

  await page.getByRole('button', { name: 'Empty' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete all 500 items for good?');
  const emptying = Date.now();
  await dialog.getByRole('button', { name: 'Delete all' }).click();
  await expect(page.getByText('Nothing deleted.')).toBeVisible({ timeout: 15_000 });
  const emptyMs = Date.now() - emptying;
  testInfo.annotations.push({ type: 'empty-500-ms', description: String(emptyMs) });
  expect(emptyMs).toBeLessThan(5000);
  expect(await completionCount(page)).toBe(0);
});

test('clearing completed to-dos moves them to Recently deleted', async ({ page }) => {
  await addItem(page, 'Pay rent', 'To-do');
  await addItem(page, 'Call mom', 'To-do');
  await page.getByRole('checkbox', { name: 'Pay rent' }).click();
  await expect(page.getByRole('checkbox', { name: 'Pay rent' })).toHaveCount(0, { timeout: 6_000 });

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: 'Personal' }).click();
  await page.getByRole('button', { name: 'Clear completed' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Clear 1 completed to-do? You can restore them from Recently deleted.');
  await dialog.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('button', { name: /^Completed/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Call mom' })).toBeVisible();

  await page.goto('./#/deleted');
  await expect(page.getByRole('button', { name: 'Restore Pay rent' })).toBeVisible();
});

test('dragging a goal above a habit on a list page changes Today’s order', async ({ page }) => {
  await addItem(page, 'Stretch', 'Daily habit', '💪 Health');
  await addItem(page, 'Peloton ride', 'Weekly goal', '💪 Health');
  const fitness = page.getByRole('region', { name: 'Health' });
  await expect(fitness.getByRole('link')).toHaveText(['Stretch', 'Peloton ride']);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const handle = page.getByRole('button', { name: 'Reorder Peloton ride' });
  await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = (await handle.boundingBox())!;
  const row = (await page.locator('.reorder-row').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - row.height, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.reorder-name')).toHaveText(['Peloton ride', 'Stretch']);
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(fitness.getByRole('link')).toHaveText(['Peloton ride', 'Stretch']);
  await page.reload();
  await expect(fitness.getByRole('link')).toHaveText(['Peloton ride', 'Stretch']);
});
