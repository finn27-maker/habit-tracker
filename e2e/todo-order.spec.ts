import { expect, test, type Page } from '@playwright/test';
import { startAdding } from './helpers';

async function addTodo(page: Page, name: string, due: 'none' | 'today' | string) {
  await startAdding(page, 'To-do');
  await page.getByLabel('Name').fill(name);
  const sheet = page.getByRole('dialog');
  if (due === 'none' || due === 'today') {
    await sheet.getByLabel('Due', { exact: true }).selectOption(due);
  } else {
    await sheet.getByLabel('Due', { exact: true }).selectOption('pick');
    await sheet.getByLabel('Date', { exact: true }).fill(due);
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  // Wednesday 2026-10-14, 9 am in Chicago.
  await page.clock.install({ time: new Date('2026-10-14T09:00:00-05:00') });
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('dragging a to-do on a list page keeps that order there, while Today stays by date', async ({ page }) => {
  await addTodo(page, 'Update pitch deck', 'none');
  await addTodo(page, 'Send term sheet', 'today');
  await addTodo(page, 'Call the bank', '2026-10-20');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: /Health/ }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await expect(page.locator('.row .name')).toHaveText([/^Send term sheet/, /^Call the bank/, /^Update pitch deck/]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const group = page.getByRole('list', { name: 'To-dos' });
  const handle = group.getByRole('button', { name: 'Reorder Update pitch deck' });
  await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = (await handle.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(43.5);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  const row = (await group.locator('.reorder-row').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 2 * row.height, { steps: 10 });
  await page.mouse.up();
  await expect(group.locator('.reorder-name')).toHaveText(['Update pitch deck', 'Send term sheet', 'Call the bank']);
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.locator('.row .name')).toHaveText([/^Update pitch deck/, /^Send term sheet/, /^Call the bank/]);
  await page.reload();
  await expect(page.locator('.row .name')).toHaveText([/^Update pitch deck/, /^Send term sheet/, /^Call the bank/]);

  // Today is still by date: due today first, then undated; next week's isn't on Today.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
  const health = page.getByRole('region', { name: 'Health' });
  await expect(health.getByRole('checkbox')).toHaveCount(2);
  await expect(health.locator('.row .name')).toHaveText([/^Send term sheet/, /^Update pitch deck/]);
});

test('Sort by date puts a hand-ordered list back in date order, and it stays after a reload', async ({ page }) => {
  await addTodo(page, 'Update pitch deck', 'none');
  await addTodo(page, 'Send term sheet', 'today');
  await addTodo(page, 'Call the bank', '2026-10-20');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: /Health/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const group = page.getByRole('list', { name: 'To-dos' });
  await expect(page.getByRole('button', { name: 'Sort by date' })).toHaveCount(0);

  await group.getByRole('button', { name: 'Reorder Update pitch deck' }).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(group.locator('.reorder-name')).toHaveText(['Update pitch deck', 'Send term sheet', 'Call the bank']);

  const sort = page.getByRole('button', { name: 'Sort by date' });
  const box = (await sort.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  await sort.click();
  await expect(group.locator('.reorder-name')).toHaveText(['Send term sheet', 'Call the bank', 'Update pitch deck']);
  await expect(page.getByRole('status').filter({ hasText: 'To-dos sorted by date.' })).toBeVisible();
  await expect(sort).toHaveCount(0);

  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.locator('.row .name')).toHaveText([/^Send term sheet/, /^Call the bank/, /^Update pitch deck/]);
});
