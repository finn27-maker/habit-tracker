import { expect, test } from '@playwright/test';

test('the tab bar switches between Today and Lists', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Lists' }).click();
  await expect(page).toHaveURL(/#\/lists$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lists' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lists' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

test('an unknown route falls back to Today', async ({ page }) => {
  await page.goto('./#/nonsense');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

test('first open shows the four starter lists', async ({ page }) => {
  await page.goto('./#/lists');
  const rows = page.getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.locator('.name')).toHaveText(['Fitness', 'Work', 'Side Business', 'Personal']);
  await expect(rows.first()).toContainText('🏋');
});

test('a new list and a reorder survive a reload', async ({ page }) => {
  await page.goto('./#/lists');
  await expect(page.getByRole('listitem')).toHaveCount(4);

  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('Name').fill('Reading');
  await page.getByLabel('Emoji').fill('📚');
  await page.getByRole('radio', { name: 'teal' }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(5);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Move Reading up' }).click();
  await expect(page.locator('.name')).toHaveText([
    'Fitness',
    'Work',
    'Side Business',
    'Reading',
    'Personal',
  ]);

  await page.reload();
  await expect(page.locator('.name')).toHaveText([
    'Fitness',
    'Work',
    'Side Business',
    'Reading',
    'Personal',
  ]);
});

test('deleting a starter list sticks, and the starters never come back', async ({ page }) => {
  await page.goto('./#/lists');
  await expect(page.getByRole('listitem')).toHaveCount(4);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Personal' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete "Personal"?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(3);

  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('every control is at least 44 by 44 pixels', async ({ page }) => {
  await page.goto('./#/lists');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const controls = page.locator('.tools button, nav a, .actions button');
  const count = await controls.count();
  expect(count).toBeGreaterThan(8);
  for (let i = 0; i < count; i++) {
    const box = await controls.nth(i).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(43.5);
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
});
