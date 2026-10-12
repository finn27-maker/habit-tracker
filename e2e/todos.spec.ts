import { expect, test, type Page } from '@playwright/test';
import { completedTodoCount } from './helpers';

async function addTodo(page: Page, name: string, list: string, due = 'No date') {
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('List').selectOption({ label: list });
  await page.getByLabel('Repeats').selectOption({ label: 'Once (to-do)' });
  await page.getByLabel('Due').selectOption({ label: due });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

/** The local day `days` from now, as YYYY-MM-DD (what a date field holds). */
function localDay(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('a to-do is checked off, moves to Completed, and can be restored', async ({ page }) => {
  await addTodo(page, 'Clean garage', '🏠 Personal');
  const box = page.getByRole('checkbox', { name: 'Clean garage' });
  await expect(page.getByRole('region', { name: 'Personal' })).toContainText('Clean garage');

  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(box).toHaveCount(0, { timeout: 6_000 });
  await expect.poll(() => completedTodoCount(page)).toBe(1);

  await page.reload();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();

  await page.getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: 'Personal' }).click();
  await expect(page).toHaveURL(/#\/list\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Personal' })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs.getByRole('link', { name: 'Lists' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const completed = page.getByRole('button', { name: 'Completed (1)' });
  await expect(completed).toHaveAttribute('aria-expanded', 'false');
  await completed.click();
  await expect(completed).toHaveAttribute('aria-expanded', 'true');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: /^Completed/ })).toHaveCount(0);
  await expect.poll(() => completedTodoCount(page)).toBe(0);

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(box).toBeVisible();
});

test('a to-do due tomorrow waits on its list page', async ({ page }) => {
  await addTodo(page, 'Call mom', '🏠 Personal', 'Tomorrow');
  await expect(page.getByRole('checkbox', { name: 'Call mom' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: 'Personal' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Call mom' });
  await expect(row).toContainText('Tomorrow');
});

test('"Pick a date" opens a date field already set two days ahead', async ({ page }) => {
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Repeats').selectOption({ label: 'Once (to-do)' });
  await page.getByLabel('Due').selectOption({ label: 'Pick a date' });
  await expect(page.getByLabel('Date')).toHaveValue(localDay(2));
});

test('a list page starts new items in that list', async ({ page }) => {
  await page.getByRole('link', { name: 'Lists' }).click();
  await page.getByRole('link', { name: 'Work' }).click();
  await expect(page.getByText('Nothing in this list yet. Tap + to add something.')).toBeVisible();
  await page.getByRole('button', { name: 'New habit' }).click();
  await expect(page.getByLabel('List').locator('option:checked')).toHaveText('💼 Work');
});

test('a missing list says so', async ({ page }) => {
  await page.goto('./#/list/does-not-exist');
  await expect(page.getByText('List not found')).toBeVisible();
  await page.getByRole('link', { name: 'Lists' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lists' })).toBeVisible();
});

test('to-do controls are at least 44 by 44 pixels', async ({ page }) => {
  await addTodo(page, 'Clean garage', '🏠 Personal');
  for (const target of [
    page.getByRole('checkbox', { name: 'Clean garage' }),
    page.getByRole('button', { name: 'Edit Clean garage' }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(43.5);
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
});
