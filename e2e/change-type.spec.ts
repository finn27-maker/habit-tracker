import { expect, test, type Page } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

async function add(page: Page, name: string, kind: 'Daily habit' | 'To-do') {
  await startAdding(page, kind);
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

const chooseType = (page: Page, kind: string) =>
  page.getByRole('dialog').getByRole('radio', { name: kind, exact: true }).check();

test('a daily habit becomes a weekly goal and keeps today’s check-in', async ({ page }) => {
  await page.goto('./');
  await add(page, 'Gym', 'Daily habit');
  await page.getByRole('checkbox', { name: 'Gym' }).click();
  await expect.poll(() => completionCount(page)).toBe(1);

  await page.getByRole('link', { name: 'Gym details' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await chooseType(page, 'Weekly goal');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /^Log Gym/ })).toContainText('1/3');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Log Gym/ })).toContainText('1/3');
  expect(await completionCount(page)).toBe(1);
});

test('a to-do becomes a daily habit after confirming', async ({ page }) => {
  await page.goto('./');
  await add(page, 'Stretch', 'To-do');
  await page.getByRole('button', { name: 'Edit Stretch' }).click();
  await chooseType(page, 'Daily habit');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Change “Stretch” to a daily habit? Its due date and checkmark are kept and come back if you change it back.',
  );
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('checkbox', { name: 'Stretch' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Stretch' })).toHaveCount(0);
});

test('three years of check-ins change type quickly and all stay', async ({ page }, testInfo) => {
  await page.goto('./');
  await add(page, 'Read', 'Daily habit');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['items', 'completions'], 'readwrite');
          const request = tx.objectStore('items').getAll();
          request.onsuccess = () => {
            const itemId = (request.result as { id: string }[])[0]!.id;
            const start = new Date(2023, 9, 1);
            for (let i = 0; i < 1100; i += 1) {
              const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
              const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              tx.objectStore('completions').put({ id: `r-${i}`, itemId, dayKey, createdAt: i });
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.getByRole('link', { name: 'Read details' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await chooseType(page, 'Weekly goal');
  await page.getByLabel('Times per week').selectOption('5');

  const started = Date.now();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'type-change-1100-ms', description: String(ms) });
  expect(ms).toBeLessThan(5000);
  expect(await completionCount(page)).toBe(1100);
});
