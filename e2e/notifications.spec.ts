import { expect, test, type Page } from '@playwright/test';
import { startAdding } from './helpers';

// Delivers real push messages to the built service worker (Chromium's DevTools protocol) and
// records the notifications it asks to show. Headless Chromium refuses the notification
// permission inside service workers, so showNotification is replaced by a recorder; everything
// before it (parsing, reading IndexedDB, writing the text) is the real worker.
// WebKit can't drive service workers in Playwright.

async function addTodo(page: Page, name: string, due: 'today' | string) {
  await startAdding(page, 'To-do');
  await page.getByLabel('Name').fill(name);
  const sheet = page.getByRole('dialog');
  if (due === 'today') {
    await sheet.getByLabel('Due', { exact: true }).selectOption('today');
  } else {
    await sheet.getByLabel('Due', { exact: true }).selectOption('pick');
    await sheet.getByLabel('Date', { exact: true }).fill(due);
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function pushTo(page: Page, data: unknown) {
  const cdp = await page.context().newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const live = registrations.find((r: { isDeleted: boolean }) => !r.isDeleted);
      if (live) resolve(live.registrationId);
    });
  });
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify(data),
  });
}

type Shown = { title: string; body?: string; tag?: string };

const shown = (page: Page) =>
  page.context().serviceWorkers()[0]!.evaluate(() => (self as unknown as { shown: Shown[] }).shown);

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service workers are only drivable in Chromium');
  // Friday 2026-11-20, 9 am in Denver.
  await page.clock.install({ time: new Date('2026-11-20T09:00:00-07:00') });
  await page.goto('./');
  await expect(page.getByRole('status')).toHaveText(/Ready to work offline/);
  await context.serviceWorkers()[0]!.evaluate(() => {
    const worker = self as unknown as { shown: Shown[]; registration: ServiceWorkerRegistration };
    worker.shown = [];
    worker.registration.showNotification = async (title: string, options?: NotificationOptions) => {
      worker.shown.push({ title, body: options?.body, tag: options?.tag });
    };
  });
});

test('the morning push is written from the phone’s own to-dos', async ({ page }) => {
  await addTodo(page, 'Pay rent', '2026-11-18');
  await addTodo(page, 'Send term sheet', 'today');
  await addTodo(page, 'Call the bank', '2026-11-24');

  await pushTo(page, { kind: 'due', day: '2026-11-20' });
  await expect.poll(() => shown(page)).toEqual([
    { title: '2 to-dos due today (1 overdue)', body: 'Pay rent, Send term sheet', tag: 'due-summary' },
  ]);
});

test('assistant arrivals and unreadable pushes still show a notification', async ({ page }) => {
  await pushTo(page, { kind: 'arrivals', count: 2, titles: ['Call KeyBank', '<b>Send</b> the memo'] });
  await pushTo(page, { kind: 'mystery' });
  await expect
    .poll(async () => (await shown(page)).sort((a, b) => String(a.tag).localeCompare(String(b.tag))))
    .toEqual([
      { title: '2 new to-dos from your assistant', body: 'Call KeyBank, <b>Send</b> the memo', tag: 'arrivals' },
      { title: 'Habit Tracker', body: "Open the app to see what's new.", tag: 'habit-tracker' },
    ]);
});

test('with everything done, the summary says all caught up', async ({ page }) => {
  await pushTo(page, { kind: 'due', day: '2026-11-20' });
  await expect.poll(() => shown(page)).toEqual([
    { title: 'All caught up', body: 'Nothing is due today.', tag: 'due-summary' },
  ]);
});
