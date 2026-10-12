import { expect, test, type Page } from '@playwright/test';

async function addHabit(page: Page, name: string, weekly = false) {
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill(name);
  if (weekly) await page.getByLabel('Repeats').selectOption({ label: 'Times a week' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('a duplicate daily habit can be deleted and stays gone after a reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Peloton ride');
  await addHabit(page, 'Peloton ride', true);

  await page.getByRole('button', { name: 'Edit Peloton ride' }).first().click();
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

test('the circle checks off and the name opens the edit sheet', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Meditate');

  await page.getByRole('checkbox', { name: 'Meditate' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit Meditate' }).click();
  await page.getByLabel('Name').fill('Meditate 10 min');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate 10 min' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('cancelling a delete keeps the item', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Meditate');

  await page.getByRole('button', { name: 'Edit Meditate' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Meditate');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toBeVisible();
});

test('the circle and the name are each at least 44 by 44 pixels', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Meditate');
  for (const target of [
    page.getByRole('checkbox', { name: 'Meditate' }),
    page.getByRole('button', { name: 'Edit Meditate' }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(43.5);
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
});
