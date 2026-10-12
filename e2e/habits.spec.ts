import { expect, test, type Page } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

test.use({ timezoneId: 'America/Chicago' });

async function addHabit(page: Page, name: string, list?: string) {
  await startAdding(page, 'Daily habit');
  await page.getByLabel('Name').fill(name);
  if (list) await page.getByLabel('List').selectOption({ label: list });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('add a habit, check it off, and it stays checked after a reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();

  await addHabit(page, 'Meditate');
  const box = page.getByRole('checkbox', { name: 'Meditate' });
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('img', { name: /streak/ })).toHaveCount(0);

  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('img', { name: '1 day streak' })).toHaveText('🔥 1');
  await expect.poll(() => completionCount(page)).toBe(1);

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('img', { name: '1 day streak' })).toBeVisible();
});

test('tapping a checked habit again un-checks it', async ({ page }) => {
  await page.goto('./');
  await addHabit(page, 'Meditate');
  const box = page.getByRole('checkbox', { name: 'Meditate' });

  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('img', { name: /streak/ })).toHaveCount(0);
  await expect.poll(() => completionCount(page)).toBe(0);

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('habits are grouped under their list headers in list order', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, 'Inbox zero', '💼 Work');
  await addHabit(page, 'Stretch', '🏋️ Fitness');

  const headers = page.getByRole('heading', { level: 2 }).locator('.name');
  await expect(headers).toHaveText(['Fitness', 'Work']);
  const fitness = page.getByRole('region', { name: /Fitness/ });
  await expect(fitness.getByRole('checkbox', { name: 'Stretch' })).toBeVisible();
  const work = page.getByRole('region', { name: /Work/ });
  await expect(work.getByRole('checkbox', { name: 'Inbox zero' })).toBeVisible();
});

test('the new-habit sheet starts on the first list and rejects a blank name', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await startAdding(page, 'Daily habit');

  await expect(page.getByLabel('List').locator('option:checked')).toContainText('Fitness');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toHaveText("Name can't be empty");
  await expect(page.getByRole('dialog', { name: 'New daily habit' })).toBeVisible();
});

test('a habit name with HTML is shown as plain text', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addHabit(page, '<img src=x onerror=alert(1)>');
  await expect(
    page.getByRole('checkbox', { name: '<img src=x onerror=alert(1)>' }),
  ).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
});

test('checkboxes and the add button are at least 44 by 44 pixels', async ({ page }) => {
  await page.goto('./');
  await addHabit(page, 'Meditate');
  for (const target of [
    page.getByRole('checkbox', { name: 'Meditate' }),
    page.getByRole('button', { name: 'Add', exact: true }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(43.5);
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
});

test('checking habits off makes no requests beyond the app itself', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('./');
  await addHabit(page, 'Meditate');
  await page.getByRole('checkbox', { name: 'Meditate' }).click();
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect([...origins]).toEqual(['http://localhost:4173']);
});

test('checkmarks clear by themselves at local midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T23:59:50-05:00') });
  await page.goto('./');
  await expect(page.getByText('Wednesday, October 14')).toBeVisible();

  await addHabit(page, 'Meditate');
  const box = page.getByRole('checkbox', { name: 'Meditate' });
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');

  await page.clock.fastForward(20_000);

  await expect(page.getByText('Thursday, October 15')).toBeVisible();
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('img', { name: '1 day streak, not done today' })).toBeVisible();
});
