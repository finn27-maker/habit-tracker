import { expect, test, type Page } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

async function addHabit(page: Page, name: string) {
  await startAdding(page, 'Daily habit');
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

test('backfilling a missed day fixes the streak and survives a reload', async ({ page }) => {
  await addHabit(page, 'Meditate');
  await page.getByRole('checkbox', { name: 'Meditate' }).click();
  await expect.poll(() => completionCount(page)).toBe(1);

  await page.getByRole('link', { name: 'Meditate details' }).click();
  await expect(page).toHaveURL(/#\/item\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Meditate' })).toBeVisible();
  await page.getByRole('button', { name: 'October 13, not done' }).click();
  await page.getByRole('button', { name: 'October 12, not done' }).click();
  await expect(page.getByRole('button', { name: 'October 12, done' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => completionCount(page)).toBe(3);

  await page.reload();
  await expect(page.getByRole('button', { name: 'October 13, done' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Last 6 months: 3 of 179 days done' })).toBeVisible();

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('img', { name: '3 day streak' })).toBeVisible();
});

test('earlier months open, future days are locked, and controls are big enough', async ({
  page,
}) => {
  await addHabit(page, 'Meditate');
  await page.getByRole('link', { name: 'Meditate details' }).click();

  await expect(page.getByRole('button', { name: 'October 15' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'September 2026' })).toBeVisible();

  const days = page.getByRole('button', { name: /^September \d+, / });
  await expect(days).toHaveCount(30);
  for (const control of [
    days.first(),
    page.getByRole('button', { name: 'Previous month' }),
    page.getByRole('button', { name: 'Edit', exact: true }),
    page.getByRole('link', { name: 'Back' }),
  ]) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(39.5);
    expect(box?.height).toBeGreaterThanOrEqual(39.5);
  }
  // The heatmap is a single labelled image, not 182 tiny controls.
  await expect(page.getByRole('img', { name: /^Last 6 months:/ })).toHaveCount(1);
});
