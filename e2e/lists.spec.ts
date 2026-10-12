import { expect, test, type Page } from '@playwright/test';
import { storedListNames } from './helpers';

/** Presses a list's reorder handle and drags it `rows` rows (negative = up), then lets go. */
async function dragRows(page: Page, name: string, rows: number) {
  const handle = page.getByRole('button', { name: `Reorder ${name}` });
  // The Lists tab can be taller than a phone screen, and the fixed tab bar covers its bottom
  // edge: centre the handle, as a person would scroll it clear before pressing it.
  await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const handleBox = (await handle.boundingBox())!;
  const rowBox = (await page.getByRole('listitem').filter({ has: handle }).boundingBox())!;
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + rows * rowBox.height, { steps: 8 });
  await page.mouse.up();
}

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
  await dragRows(page, 'Reading', -1);
  await expect(page.locator('.name')).toHaveText([
    'Fitness',
    'Work',
    'Side Business',
    'Reading',
    'Personal',
  ]);
  await expect
    .poll(() => storedListNames(page))
    .toEqual(['Fitness', 'Work', 'Side Business', 'Reading', 'Personal']);

  await page.reload();
  await expect(page.locator('.name')).toHaveText([
    'Fitness',
    'Work',
    'Side Business',
    'Reading',
    'Personal',
  ]);
});

test('dragging a list to the top reorders Today too, and the handle never scrolls', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill('Stretch');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByLabel('Name').fill('Call mom');
  await page.getByLabel('List').selectOption({ label: '🏠 Personal' });
  await page.getByLabel('Repeats').selectOption({ label: 'Once (to-do)' });
  await page.getByRole('button', { name: 'Save' }).click();
  const groups = page.locator('h2 .name');
  await expect(groups).toHaveText(['Fitness', 'Personal']);

  await page.getByRole('link', { name: 'Lists' }).click();
  // With habits saved, the backup reminder appears above the lists; let the layout settle.
  await expect(page.getByRole('complementary', { name: 'Backup reminder' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
  const handle = page.getByRole('button', { name: 'Reorder Personal' });
  await expect(handle).toHaveCSS('touch-action', 'none');

  await dragRows(page, 'Personal', -3);
  await expect(page.locator('.name')).toHaveText(['Personal', 'Fitness', 'Work', 'Side Business']);
  await expect
    .poll(() => storedListNames(page))
    .toEqual(['Personal', 'Fitness', 'Work', 'Side Business']);

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(groups).toHaveText(['Personal', 'Fitness']);
  await page.reload();
  await expect(groups).toHaveText(['Personal', 'Fitness']);
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
