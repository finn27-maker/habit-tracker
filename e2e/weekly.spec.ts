import { expect, test, type Page } from '@playwright/test';
import { completionCount } from './helpers';

test.use({ timezoneId: 'America/Chicago' });

const ring = (page: Page, title: string, count: number, target: number, met = false) =>
  page.getByRole('button', {
    name: `Log ${title}, ${count} of ${target} this week${met ? ', goal met' : ''}`,
    exact: true,
  });

async function addWeekly(page: Page, name: string, target = 3, list?: string) {
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill(name);
  if (list) await page.getByLabel('List').selectOption({ label: list });
  await page.getByLabel('Repeats').selectOption({ label: 'Times a week' });
  await page.getByLabel('Times per week').selectOption(String(target));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('add a weekly goal, log it past the target, undo one, and keep it after a reload', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();

  await addWeekly(page, 'Peloton ride');
  await expect(ring(page, 'Peloton ride', 0, 3)).toHaveText('0/3');
  await expect(page.getByRole('button', { name: /Remove last/ })).toHaveCount(0);

  await ring(page, 'Peloton ride', 0, 3).click();
  await ring(page, 'Peloton ride', 1, 3).click();
  await ring(page, 'Peloton ride', 2, 3).click();
  await expect(ring(page, 'Peloton ride', 3, 3, true)).toHaveText('3/3');
  await ring(page, 'Peloton ride', 3, 3, true).click();
  await expect(ring(page, 'Peloton ride', 4, 3, true)).toHaveText('4/3');

  await page.getByRole('button', { name: 'Remove last Peloton ride log' }).click();
  await expect(ring(page, 'Peloton ride', 3, 3, true)).toBeVisible();
  await expect.poll(() => completionCount(page)).toBe(3);

  await page.reload();
  await expect(ring(page, 'Peloton ride', 3, 3, true)).toHaveText('3/3');
});

test('a weekly goal sits beside daily habits under its list', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();

  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill('Stretch');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await addWeekly(page, 'Peloton ride');

  const fitness = page.getByRole('region', { name: /Fitness/ });
  const rows = fitness.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole('checkbox', { name: 'Stretch' })).toBeVisible();
  await expect(rows.nth(1).getByRole('button', { name: /^Log Peloton ride/ })).toBeVisible();
});

test('tapping the name edits the target, and the new target survives a reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addWeekly(page, 'Peloton ride');
  await ring(page, 'Peloton ride', 0, 3).click();

  await page.getByRole('button', { name: 'Edit Peloton ride' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit weekly goal' })).toBeVisible();
  await expect(page.getByLabel('Repeats')).toHaveCount(0);
  await page.getByLabel('Times per week').selectOption('4');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(ring(page, 'Peloton ride', 1, 4)).toHaveText('1/4');
  await expect.poll(() => completionCount(page)).toBe(1);
  await page.reload();
  await expect(ring(page, 'Peloton ride', 1, 4)).toHaveText('1/4');
});

test('the target must be chosen from 1 to 14 and a name is required', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Repeats').selectOption({ label: 'Times a week' });

  await expect(page.getByLabel('Times per week')).toHaveValue('3');
  await expect(page.getByLabel('Times per week').locator('option')).toHaveCount(14);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toHaveText("Name can't be empty");
});

test('the ring resets by itself when the app stays open across Saturday midnight', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-17T23:59:50-05:00') });
  await page.goto('./');
  await expect(page.getByText('Saturday, October 17')).toBeVisible();

  await addWeekly(page, 'Peloton ride');
  await ring(page, 'Peloton ride', 0, 3).click();
  await ring(page, 'Peloton ride', 1, 3).click();
  await ring(page, 'Peloton ride', 2, 3).click();
  await expect(ring(page, 'Peloton ride', 3, 3, true)).toBeVisible();

  await page.clock.fastForward(20_000);

  await expect(page.getByText('Sunday, October 18')).toBeVisible();
  await expect(ring(page, 'Peloton ride', 0, 3)).toHaveText('0/3');
  await expect(
    page.getByRole('img', { name: '1 week streak, not met yet this week' }),
  ).toBeVisible();
});

test('a goal name with HTML is plain text and logging makes no outside requests', async ({
  page,
}) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();

  await addWeekly(page, '<img src=x onerror=alert(1)>');
  await ring(page, '<img src=x onerror=alert(1)>', 0, 3).click();
  await expect(ring(page, '<img src=x onerror=alert(1)>', 1, 3)).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  expect([...origins]).toEqual(['http://localhost:4173']);
});

test('the ring, name and minus controls are at least 44 by 44 pixels', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addWeekly(page, 'Peloton ride');
  await ring(page, 'Peloton ride', 0, 3).click();

  for (const target of [
    ring(page, 'Peloton ride', 1, 3),
    page.getByRole('button', { name: 'Edit Peloton ride' }),
    page.getByRole('button', { name: 'Remove last Peloton ride log' }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(43.5);
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
});
