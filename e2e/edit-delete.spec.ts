import { expect, test, type Page } from '@playwright/test';
import { startAdding } from './helpers';

async function addHabit(page: Page, name: string, weekly = false) {
  await startAdding(page, weekly ? 'Weekly goal' : 'Daily habit');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('a duplicate daily habit can be deleted and stays gone after a reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Peloton ride');
  await addHabit(page, 'Peloton ride', true);

  await page.getByRole('link', { name: 'Peloton ride details' }).first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit habit' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog')).toContainText('Delete "Peloton ride"?');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByRole('checkbox', { name: 'Peloton ride' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Log Peloton ride/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /^Log Peloton ride/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Peloton ride' })).toHaveCount(0);
});

test('the circle checks off and the name opens the page with Edit', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Meditate');

  await page.getByRole('checkbox', { name: 'Meditate' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Meditate details' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name').fill('Meditate 10 min');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Meditate 10 min' })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate 10 min' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('cancelling a delete keeps the item', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Meditate');

  await page.getByRole('link', { name: 'Meditate details' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Meditate');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toBeVisible();
});

test('the circle and the name are each at least 44 by 44 pixels', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Meditate');
  for (const target of [
    page.getByRole('checkbox', { name: 'Meditate' }),
    page.getByRole('link', { name: 'Meditate details' }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(43.5);
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
});
