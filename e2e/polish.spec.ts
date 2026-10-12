import { expect, test, type Page } from '@playwright/test';
import { completionCount } from './helpers';

async function addItem(page: Page, name: string, repeats?: string, list = '🏠 Personal') {
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('List').selectOption({ label: list });
  if (repeats) await page.getByLabel('Repeats').selectOption({ label: repeats });
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

test('500 deleted items show in under a second', async ({ page }) => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('items', 'readwrite');
          for (let i = 0; i < 500; i += 1) {
            tx.objectStore('items').put({
              id: `old-${i}`,
              listId: 'gone',
              type: 'daily',
              title: `Old ${i}`,
              order: i,
              archivedAt: i,
            });
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
  expect(Date.now() - started).toBeLessThan(1000);
});

test('clearing completed to-dos moves them to Recently deleted', async ({ page }) => {
  await addItem(page, 'Pay rent', 'Once (to-do)');
  await addItem(page, 'Call mom', 'Once (to-do)');
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
  await addItem(page, 'Stretch', undefined, '🏋️ Fitness');
  await addItem(page, 'Peloton ride', 'Times a week', '🏋️ Fitness');
  const fitness = page.getByRole('region', { name: 'Fitness' });
  await expect(fitness.getByRole('link')).toHaveText(['Stretch', 'Peloton ride']);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: 'Fitness' }).click();
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
