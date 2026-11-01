import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completionCount, startAdding } from './helpers';

async function addItem(
  page: Page,
  name: string,
  kind: 'Daily habit' | 'Weekly goal' | 'To-do' = 'Daily habit',
  list?: string,
) {
  await startAdding(page, kind);
  await page.getByLabel('Name').fill(name);
  if (list) await page.getByLabel('List').selectOption({ label: list });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

/** A habit, a goal, an open to-do, a completed to-do and a deleted habit. */
async function seed(page: Page) {
  await page.goto('./');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await addItem(page, 'Meditate', 'Daily habit', '⭐ Personal');
  await addItem(page, 'Peloton ride', 'Weekly goal', '⭐ Personal');
  await addItem(page, 'Call mom', 'To-do', '⭐ Personal');
  await addItem(page, 'Pay rent', 'To-do', '⭐ Personal');
  await addItem(page, 'Old habit', 'Daily habit', '⭐ Personal');
  await page.getByRole('checkbox', { name: 'Meditate' }).click();
  await expect.poll(() => completionCount(page)).toBe(1);
  await page.getByRole('checkbox', { name: 'Pay rent' }).click();
  await expect(page.getByRole('checkbox', { name: 'Pay rent' })).toHaveCount(0, { timeout: 6_000 });
  await page.getByRole('link', { name: 'Old habit details' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
}

async function expectAccessible(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const problems = results.violations.map(
    (violation) =>
      `${screen}: ${violation.id} at ${violation.nodes
        .map((node) => `${node.target.join(' ')} ${node.html} (${node.failureSummary})`)
        .join(', ')}`,
  );
  expect(problems).toEqual([]);
}

/** Visits every screen and runs `check` on each. */
async function everyScreen(page: Page, check: (screen: string) => Promise<void>) {
  await page.goto('./#/today');
  await expect(page.getByRole('checkbox', { name: 'Meditate' })).toBeVisible();
  await check('Today');

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New to-do' })).toBeVisible();
  await check('New to-do sheet');
  await page.getByRole('radio', { name: 'Weekly goal', exact: true }).check();
  await expect(page.getByRole('dialog', { name: 'New weekly goal' })).toBeVisible();
  await check('New weekly goal sheet');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('link', { name: 'Meditate details' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Meditate' })).toBeVisible();
  await check('Habit page');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'To-do', exact: true }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('Change “Meditate” to a to-do?');
  await check('Change type confirmation');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('./#/upcoming');
  await expect(page.getByRole('heading', { level: 1, name: 'Upcoming' })).toBeVisible();
  await check('Upcoming');

  await page.goto('./#/history');
  await expect(page.getByRole('link', { name: /^Meditate/ })).toBeVisible();
  await check('History');

  await page.goto('./#/lists');
  await expect(page.getByRole('button', { name: 'Export backup' })).toBeEnabled();
  await check('Lists');

  const empty = { lists: [], items: [], completions: [], targetHistory: [] };
  await page.locator('input[type=file]').setInputFiles({
    name: 'habit-tracker-backup-2026-10-01.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ app: 'habit-tracker', version: 1, exportedAt: new Date().toISOString(), data: empty }),
    ),
  });
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await check('Restore confirmation');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await check('Lists in Edit mode');

  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('link', { name: 'Personal' }).click();
  await page.getByRole('button', { name: 'Completed (1)' }).click();
  await expect(page.getByRole('checkbox', { name: 'Pay rent' })).toBeVisible();
  await check('List page with Completed open');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await check('List page in Edit mode');

  await page.goto('./#/deleted');
  await expect(page.getByRole('button', { name: 'Restore Old habit' })).toBeVisible();
  await check('Recently deleted');
  await page.getByRole('button', { name: 'Delete Old habit' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await check('Delete for good confirmation');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every screen passes axe in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seed(page);
    await everyScreen(page, (screen) => expectAccessible(page, `${scheme} ${screen}`));
  });
}

test('large text never makes a screen scroll sideways', async ({ page }) => {
  await seed(page);
  await page.addStyleTag({ content: ':root { font-size: 28px !important; }' });
  await everyScreen(page, async (screen) => {
    await page.addStyleTag({ content: ':root { font-size: 28px !important; }' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${screen} scrolls sideways`).toBeLessThanOrEqual(0);
  });
});
