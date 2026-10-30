import { expect, test, type Page, type Request } from '@playwright/test';

const ASSISTANT = 'https://app.80dventures.com';
const CODE = 'Ab3_-defghijklmnopqrstuvwxyz0123456789ABCDE';
const CORS = {
  'access-control-allow-origin': 'http://localhost:4173',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Authorization, Content-Type',
  'cache-control': 'no-store',
};

/** Stands in for the assistant: one pending to-do until it is acknowledged. */
async function mockAssistant(page: Page) {
  const acked: string[] = [];
  await page.route(`${ASSISTANT}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (request.headers()['authorization'] !== `Bearer ${CODE}`) {
      return route.fulfill({ status: 401, headers: CORS, json: { error: 'unauthorized' } });
    }
    if (request.url().endsWith('/api/habit-tracker/ack')) {
      acked.push(...(request.postDataJSON() as { ids: string[] }).ids);
      return route.fulfill({ status: 200, headers: CORS, json: { acknowledged: acked.length } });
    }
    const todos = acked.includes('t1')
      ? []
      : [{ id: 't1', title: 'Pay Xcel bill', list: 'work', due: '2026-11-03', note: 'next week' }];
    return route.fulfill({ status: 200, headers: CORS, json: { version: 1, todos } });
  });
  return acked;
}

async function holdVersionLine(page: Page) {
  const line = page.getByText(/^Version \d+\.\d+\.\d+$/);
  await line.scrollIntoViewIfNeeded();
  const box = (await line.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // The line must not sit under the tab bar. Chromium may show "Ready to work offline" over
  // it once the service worker installs; a person taps OK first, and so does the test.
  const ok = page.getByRole('button', { name: 'OK', exact: true });
  await expect
    .poll(async () => {
      if (await ok.isVisible()) await ok.click();
      return page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.textContent ?? '', [x, y]);
    })
    .toMatch(/^Version /);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(3_200);
  await page.mouse.up();
}

test('an unpaired app never contacts the assistant, even on the Lists tab', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (req) => origins.add(new URL(req.url()).origin));
  await page.goto('./#/lists');
  await expect(page.getByText(/^Version /)).toBeVisible();
  await page.getByText(/^Version /).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  expect([...origins]).toEqual(['http://localhost:4173']);
});

test('pairing pulls the to-do into the matching list and sends nothing of mine', async ({
  page,
  browserName,
}) => {
  const acked = await mockAssistant(page);
  const sent: Request[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith('http://localhost:4173')) sent.push(req);
  });

  await page.goto('./#/lists');
  if (browserName === 'chromium') {
    // Chromium installs the service worker and shows this notice, sometimes seconds later on
    // a slow runner. Appearing over the line mid-hold would (rightly) cancel the hold, so
    // dismiss it first, as a person would.
    await expect(page.getByText('✓ Ready to work offline')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
  }
  await holdVersionLine(page);
  const sheet = page.getByRole('dialog', { name: 'Assistant' });
  await sheet.getByLabel('Pairing code').fill(CODE);
  await sheet.getByRole('button', { name: 'Pair' }).click();
  await expect(sheet.getByText('Connected to your assistant')).toBeVisible();
  await expect.poll(() => acked).toEqual(['t1']);
  await sheet.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: /Work/ }).first().click();
  await expect(page.getByText('Pay Xcel bill')).toHaveCount(1);
  // The assistant's note is kept and shown under the to-do (s16).
  await expect(page.getByRole('button', { name: 'Edit Pay Xcel bill' })).toContainText('next week');

  expect(new Set(sent.map((req) => new URL(req.url()).origin))).toEqual(new Set([ASSISTANT]));
  for (const req of sent) {
    const body = req.postData() ?? '';
    for (const word of ['Health', 'Home', 'Personal', 'Pay Xcel bill', 'next week']) {
      expect(body).not.toContain(word);
    }
  }

  await page.reload();
  await page.goto('./#/lists');
  await page.getByRole('link', { name: /Work/ }).first().click();
  await expect(page.getByText('Pay Xcel bill')).toHaveCount(1);

  // Today names what arrived until OK (s17).
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
  const notice = page.getByRole('region', { name: 'New from your assistant' });
  await expect(notice).toHaveText(/1 new to-do from your assistant: Pay Xcel bill/);
  const ok = notice.getByRole('button', { name: 'OK' });
  expect((await ok.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await ok.click();
  await expect(notice).toHaveCount(0);
  // OK is saved after the card hides; a reload before it lands cancels the write (run 41084304915).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const open = indexedDB.open('habit-tracker');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              const request = db.transaction('meta').objectStore('meta').get('assistantUnseen');
              request.onsuccess = () => {
                db.close();
                resolve(request.result === undefined);
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test('a delivery of 50 to-dos is announced on Today without a visible wait', async ({ page }, testInfo) => {
  await page.route(`${ASSISTANT}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (request.url().endsWith('/api/habit-tracker/ack')) {
      return route.fulfill({ status: 200, headers: CORS, json: { acknowledged: 50 } });
    }
    const todos = Array.from({ length: 50 }, (_, i) => ({ id: `bulk${i}`, title: `Task ${i}`, list: '', due: null }));
    return route.fulfill({ status: 200, headers: CORS, json: { version: 1, todos } });
  });
  // Already paired: the code and status live in meta, as the Assistant sheet would leave them.
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
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

  const started = Date.now();
  await page.reload();
  await expect(page.getByRole('region', { name: 'New from your assistant' })).toHaveText(
    /50 new to-dos from your assistant: Task 0, Task 1, Task 2 and 47 more/,
    { timeout: 20_000 },
  );
  const ms = Date.now() - started;
  testInfo.annotations.push({ type: 'arrivals-50-ms', description: String(ms) });
  // Pathological ceiling only: CI's Linux WebKit runs storage ~3x slower than a Mac.
  expect(ms).toBeLessThan(15_000);
});

test('the security policy allows only the assistant as an outside connection', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'self' https://app.80dventures.com;");
});
