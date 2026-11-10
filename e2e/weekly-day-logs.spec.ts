import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

async function addGoal(page: Page, name: string) {
  await startAdding(page, 'Weekly goal');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  // Wednesday 2026-10-14, 9 am in Chicago.
  await page.clock.install({ time: new Date('2026-10-14T09:00:00-05:00') });
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('two rides on one past day, from the day sheet, survive a reload', async ({ page }) => {
  await addGoal(page, 'Peloton ride');
  await page.getByRole('link', { name: 'Peloton ride details' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Peloton ride' })).toBeVisible();

  await page.getByRole('button', { name: 'October 12, 0 logs' }).click();
  const sheet = page.getByRole('dialog', { name: 'Monday, October 12' });
  await expect(sheet).toBeVisible();
  for (const name of ['Remove a log', 'Add a log', 'Done']) {
    const box = (await sheet.getByRole('button', { name }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(43.5);
    expect(box.height).toBeGreaterThanOrEqual(43.5);
  }
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await sheet.getByRole('button', { name: 'Add a log' }).click();
  await sheet.getByRole('button', { name: 'Add a log' }).click();
  await expect(sheet.getByRole('status')).toHaveText('2 logs');
  await expect.poll(() => completionCount(page)).toBe(2);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: 'October 12, 2 logs' })).toContainText('×2');
});

test('the day sheet opens without a visible wait on a goal with 600 logs', async ({ page }, testInfo) => {
  await addGoal(page, 'Peloton ride');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['items', 'completions'], 'readwrite');
          const items = tx.objectStore('items').getAll();
          items.onsuccess = () => {
            const itemId = (items.result as { id: string }[])[0]!.id;
            const start = new Date(2023, 9, 1);
            for (let i = 0; i < 600; i += 1) {
              const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i * 2);
              const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              tx.objectStore('completions').put({ id: `c-${i}`, itemId, dayKey, createdAt: i });
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
  await page.getByRole('link', { name: 'Peloton ride details' }).click();

  const started = Date.now();
  await page.getByRole('button', { name: /^October 13, \d+ logs?$/ }).click();
  await expect(page.getByRole('dialog', { name: 'Tuesday, October 13' })).toBeVisible();
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'day-sheet-600-ms', description: String(ms) });
  // Pathological ceiling only: CI's Linux WebKit runs storage ~3x slower than a Mac.
  expect(ms).toBeLessThan(15_000);
});
