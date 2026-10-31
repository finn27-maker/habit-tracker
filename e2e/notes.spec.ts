import { expect, test } from '@playwright/test';

test('a to-do added with a note shows it, survives a reload, and can be cleared', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Name').fill('Buy paint');
  const notes = page.getByLabel('Notes');
  await notes.fill('the blue one by the door');
  // At least 16 px, or iOS zooms the page when the field is tapped.
  expect(parseFloat(await notes.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.getByRole('button', { name: 'Save' }).click();

  const edit = page.getByRole('button', { name: 'Edit Buy paint' });
  await expect(edit).toContainText('the blue one by the door');
  await page.reload();
  await expect(edit).toContainText('the blue one by the door');

  await edit.click();
  await page.getByLabel('Notes').fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(edit).not.toContainText('the blue one');
});

test('a daily habit with a note shows it on Today and on its page (s19)', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('radio', { name: 'Daily habit', exact: true }).check();
  await page.getByLabel('Name').fill('Meditate');
  await page.getByLabel('Notes').fill('20 minutes, before breakfast');
  await page.getByRole('button', { name: 'Save' }).click();

  const link = page.getByRole('link', { name: 'Meditate details' });
  await expect(link).toContainText('20 minutes, before breakfast');
  await page.reload();
  await expect(link).toContainText('20 minutes, before breakfast');
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Meditate' })).toBeVisible();
  await expect(page.getByText('20 minutes, before breakfast')).toBeVisible();
});

test('Today with 100 noted habits opens without a visible wait (s19)', async ({ page }, testInfo) => {
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
            const listId = (lists.result as { id: string }[])[0]!.id;
            for (let i = 0; i < 100; i += 1) {
              tx.objectStore('items').put({
                id: `hn-${i}`,
                listId,
                type: 'daily',
                title: `Habit ${i}`,
                order: i,
                note: `Note ${i} `.padEnd(200, 'x'),
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
  await page.reload();
  await expect(page.locator('.note')).toHaveCount(100, { timeout: 20_000 });
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'habit-notes-100-ms', description: String(ms) });
  // Pathological ceiling only: CI's Linux WebKit runs storage ~3x slower than a Mac.
  expect(ms).toBeLessThan(15_000);
});

test('Today with 200 noted to-dos opens without a visible wait', async ({ page }, testInfo) => {
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
            const listId = (lists.result as { id: string }[])[0]!.id;
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            for (let i = 0; i < 200; i += 1) {
              tx.objectStore('items').put({
                id: `n-${i}`,
                listId,
                type: 'todo',
                title: `Task ${i}`,
                order: i,
                dueDate: today,
                note: `Note ${i} `.padEnd(200, 'x'),
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
  await page.reload();
  await expect(page.locator('.note')).toHaveCount(200, { timeout: 20_000 });
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'notes-200-ms', description: String(ms) });
  // Pathological ceiling only: CI's Linux WebKit runs storage ~3x slower than a Mac.
  expect(ms).toBeLessThan(15_000);
});
