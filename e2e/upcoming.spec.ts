import { expect, test, type Page } from '@playwright/test';
import { completedTodoCount, startAdding } from './helpers';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('Upcoming lists to-dos by date with their list, ticks them, and flips back to Today', async ({ page }) => {
  await page.goto('./');
  await startAdding(page, 'To-do');
  await page.getByLabel('Name').fill('Get stamps');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await expect(nav(page).getByRole('link')).toHaveText(['☀️ Today', '📅 Upcoming', '📈 History', '☰ Lists']);
  await nav(page).getByRole('link', { name: 'Upcoming' }).click();
  await expect(page).toHaveURL(/#\/upcoming$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Upcoming' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Upcoming' })).toHaveAttribute('aria-current', 'page');

  const today = page.getByRole('region', { name: 'Today' });
  const box = today.getByRole('checkbox', { name: 'Get stamps' });
  await expect(box).toBeVisible();
  await expect(today.getByRole('button', { name: 'Edit Get stamps' })).toHaveAccessibleDescription(
    /^\S+ (Health|Home|Work|Personal)$/,
  );
  expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

  await box.click();
  await expect.poll(() => completedTodoCount(page)).toBe(1);
  await expect(page.getByText('Nothing coming up. Tap + to add a to-do.')).toBeVisible();

  await nav(page).getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

test('Upcoming with 500 open to-dos opens without a visible wait', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['lists', 'items'], 'readwrite');
          const lists = tx.objectStore('lists').getAll();
          lists.onsuccess = () => {
            const ids = (lists.result as { id: string }[]).map((list) => list.id);
            const now = new Date();
            for (let i = 0; i < 500; i += 1) {
              const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (i % 20) - 5);
              const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              tx.objectStore('items').put({
                id: `t-${i}`,
                listId: ids[i % ids.length],
                type: 'todo',
                title: `Task ${i}`,
                order: i,
                ...(i % 9 === 0 ? {} : { dueDate: dayKey }),
              });
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
  await page.goto('./#/upcoming');
  await expect(page.getByRole('checkbox', { name: /^Task \d+$/ })).toHaveCount(500, { timeout: 20_000 });
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'upcoming-500-ms', description: String(ms) });
  // Pathological ceiling only: CI's Linux WebKit runs storage ~3x slower than a Mac.
  expect(ms).toBeLessThan(15_000);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Overdue',
    'Today',
    'Tomorrow',
    'This week',
    'Later',
    'No date',
  ]);
});
