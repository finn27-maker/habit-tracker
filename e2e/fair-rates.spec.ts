import { expect, test } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

test('a habit skipped the day after it was added shows 50%, not 100%', async ({ page }) => {
  // Added Tuesday Oct 27, skipped Oct 28, done Oct 29, viewed Oct 30 (Chicago).
  await page.clock.install({ time: new Date('2026-10-27T09:00:00-05:00') });
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await startAdding(page, 'Daily habit');
  await page.getByLabel('Name').fill('Read');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.clock.setSystemTime(new Date('2026-10-29T09:00:00-05:00'));
  await page.reload();
  await page.getByRole('checkbox', { name: 'Read' }).click();
  await expect.poll(() => completionCount(page)).toBe(1);

  await page.clock.setSystemTime(new Date('2026-10-30T09:00:00-05:00'));
  await page.goto('./#/history');
  await expect(page.getByRole('link', { name: /^Read/ })).toContainText(
    '1 day now · Best 1 day · Last 30 days 50%',
  );
});
