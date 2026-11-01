import { expect, test, type Page } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

async function addHabit(page: Page, name: string) {
  await startAdding(page, 'Daily habit');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('History shows every habit, opens its page, and Back returns to it', async ({ page }) => {
  await page.goto('./');
  await addHabit(page, 'Stretch');
  await page.getByRole('checkbox', { name: 'Stretch' }).click();
  await expect.poll(() => completionCount(page)).toBe(1);

  await expect(nav(page).getByRole('link')).toHaveText(['☀️ Today', '📅 Upcoming', '📈 History', '☰ Lists']);
  await nav(page).getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.getByRole('img', { name: 'Last 6 months: 1 check-in across 1 habit or goal' })).toBeVisible();
  const row = page.getByRole('link', { name: /^Stretch/ });
  await expect(row).toContainText('1 day now · Best 1 day · Last 30 days 100%');
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stretch' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/history$/);
});

test('30 habits with 20,000 check-ins open without a visible wait', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['lists', 'items', 'completions'], 'readwrite');
          const lists = tx.objectStore('lists').getAll();
          lists.onsuccess = () => {
            const listId = (lists.result as { id: string }[])[0]!.id;
            const start = new Date(2024, 0, 1);
            for (let h = 0; h < 30; h += 1) {
              tx.objectStore('items').put({
                id: `h-${h}`,
                listId,
                type: 'daily',
                title: `Habit ${h}`,
                order: h,
                startedOn: '2023-12-01',
              });
              for (let i = 0; i < 667; i += 1) {
                const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
                const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                tx.objectStore('completions').put({ id: `c-${h}-${i}`, itemId: `h-${h}`, dayKey, createdAt: i });
              }
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

  const started = Date.now();
  await page.goto('./#/history');
  await expect(page.getByRole('link', { name: /^Habit \d+/ })).toHaveCount(30, { timeout: 20_000 });
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'history-30x667-ms', description: String(ms) });
  // Pathological ceiling only: CI's Linux WebKit runs storage ~3x slower than a Mac.
  expect(ms).toBeLessThan(15_000);
});
