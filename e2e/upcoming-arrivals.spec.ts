import { expect, test, type Page } from '@playwright/test';
import { completedTodoCount, startAdding } from './helpers';

const ASSISTANT = 'https://app.80dventures.com';
const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';
const CORS = {
  'access-control-allow-origin': 'http://localhost:4173',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Authorization, Content-Type',
  'cache-control': 'no-store',
};

type Offer = { id: string; title: string; list: string; due: string | null; note?: string };

/** A local day key `days` from today, as the app computes it. */
function dayFromToday(days: number): string {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

/** Stands in for the assistant: offers `todos()` and records what was acknowledged. */
async function standIn(page: Page, todos: () => Offer[], status = 200) {
  const acked: string[] = [];
  await page.route(`${ASSISTANT}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (status !== 200) return route.fulfill({ status, headers: CORS, json: { error: 'down' } });
    if (request.url().endsWith('/api/habit-tracker/ack')) {
      acked.push(...(request.postDataJSON() as { ids: string[] }).ids);
      return route.fulfill({ status: 200, headers: CORS, json: { acknowledged: acked.length } });
    }
    return route.fulfill({ status: 200, headers: CORS, json: { version: 1, todos: todos() } });
  });
  return acked;
}

/** Pairs the app the way the Assistant sheet leaves it, without a reload. */
async function pair(page: Page) {
  await page.evaluate(
    (code) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ key: 'assistantCode', value: code });
          tx.objectStore('meta').put({ key: 'assistantConnected', value: true });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    CODE,
  );
}

/** The app coming back to the foreground, which makes it sync. */
const returnToApp = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

async function openUpcoming(page: Page) {
  await page.goto('./#/upcoming');
  await expect(page.getByRole('heading', { level: 1, name: 'Upcoming' })).toBeVisible();
}

const section = (page: Page, name: string) => page.getByRole('region', { name });

test('to-dos delivered while Upcoming is open appear in their sections without leaving it', async ({ page }) => {
  let offers: Offer[] = [];
  const acked = await standIn(page, () => offers);
  await openUpcoming(page);
  await expect(page.getByText('Nothing coming up. Tap + to add a to-do.')).toBeVisible();
  await pair(page);

  offers = [
    { id: 'a1', title: 'Call the bank', list: 'Work', due: dayFromToday(1) },
    { id: 'a2', title: 'Plan offsite', list: 'Work', due: dayFromToday(3), note: 'next week' },
    { id: 'a3', title: 'Read the contract', list: 'Work', due: null },
    { id: 'a4', title: 'Renew licence', list: 'Home', due: dayFromToday(-2) },
    { id: 'a5', title: 'Mystery task', list: 'Nowhere', due: null },
    { id: 'a6', title: '<img src=x onerror=alert(1)>', list: 'Home', due: null },
  ];
  await returnToApp(page);

  await expect(section(page, 'Tomorrow').getByRole('button', { name: 'Edit Call the bank' })).toContainText('💼 Work');
  await expect(page.getByRole('button', { name: 'Edit Plan offsite' })).toContainText('next week');
  await expect(section(page, 'No date').getByRole('checkbox', { name: 'Read the contract' })).toBeVisible();
  await expect(section(page, 'Overdue').getByRole('checkbox', { name: 'Renew licence' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Mystery task' })).toContainText('📥 Assistant');
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await expect(page).toHaveURL(/#\/upcoming$/);
  await expect.poll(() => acked.sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
});

test('a delivery with nothing new leaves Upcoming as it was', async ({ page }) => {
  const offers: Offer[] = [{ id: 'b1', title: 'Call the bank', list: 'Work', due: dayFromToday(1) }];
  await standIn(page, () => offers);
  await openUpcoming(page);
  await pair(page);
  await returnToApp(page);
  await expect(page.getByRole('checkbox', { name: 'Call the bank' })).toBeVisible();

  // A fresh load syncs again and is offered the same to-do, already saved.
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Call the bank' })).toBeVisible();
  await returnToApp(page);
  await expect(page.getByRole('checkbox', { name: 'Call the bank' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Tomorrow']);
});

test('a row being ticked when a delivery arrives stays done', async ({ page }) => {
  let offers: Offer[] = [];
  await standIn(page, () => offers);
  await openUpcoming(page);
  await startAdding(page, 'To-do');
  await page.getByLabel('Name').fill('Old task');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await pair(page);

  await page.getByRole('checkbox', { name: 'Old task' }).click();
  offers = [{ id: 'c1', title: 'New task', list: 'Work', due: dayFromToday(1) }];
  await returnToApp(page);

  await expect(page.getByRole('checkbox', { name: 'New task' })).toBeVisible();
  await expect.poll(() => completedTodoCount(page)).toBe(1);
});

test('a failed delivery leaves Upcoming unchanged and shows no error', async ({ page }) => {
  await standIn(page, () => [], 500);
  await openUpcoming(page);
  await pair(page);
  await returnToApp(page);
  await page.waitForTimeout(500);

  await expect(page.getByText('Nothing coming up. Tap + to add a to-do.')).toBeVisible();
  // Chromium may show "Ready to work offline" here; that status is about the app, not the sync.
  await expect(page.getByRole('status').filter({ hasNotText: 'Ready to work offline' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an unpaired app on Upcoming never contacts the assistant', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await openUpcoming(page);
  await returnToApp(page);
  await page.waitForTimeout(500);

  expect(origins.has(ASSISTANT)).toBe(false);
});

test('50 to-dos delivered on Upcoming appear without a visible wait', async ({ page }, testInfo) => {
  let offers: Offer[] = [];
  await standIn(page, () => offers);
  await openUpcoming(page);
  await pair(page);
  offers = Array.from({ length: 50 }, (_, i) => ({
    id: `bulk${i}`,
    title: `Task ${i}`,
    list: 'Work',
    due: dayFromToday((i % 20) - 5),
  }));

  const started = Date.now();
  await returnToApp(page);
  await expect(page.getByRole('checkbox', { name: /^Task \d+$/ })).toHaveCount(50, { timeout: 20_000 });
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'upcoming-arrivals-50-ms', description: String(ms) });
  // Pathological ceiling only: CI's Linux WebKit runs storage ~3x slower than a Mac.
  expect(ms).toBeLessThan(15_000);
});
