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
      : [{ id: 't1', title: 'Pay Xcel bill', list: 'work', due: '2026-11-03', note: '' }];
    return route.fulfill({ status: 200, headers: CORS, json: { version: 1, todos } });
  });
  return acked;
}

async function holdVersionLine(page: Page) {
  const line = page.getByText(/^Version \d+\.\d+\.\d+$/);
  await line.scrollIntoViewIfNeeded();
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
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

test('pairing pulls the to-do into the matching list and sends nothing of mine', async ({ page }) => {
  const acked = await mockAssistant(page);
  const sent: Request[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith('http://localhost:4173')) sent.push(req);
  });

  await page.goto('./#/lists');
  await holdVersionLine(page);
  const sheet = page.getByRole('dialog', { name: 'Assistant' });
  await sheet.getByLabel('Pairing code').fill(CODE);
  await sheet.getByRole('button', { name: 'Pair' }).click();
  await expect(sheet.getByText('Connected to your assistant')).toBeVisible();
  await expect.poll(() => acked).toEqual(['t1']);
  await sheet.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: /Work/ }).first().click();
  await expect(page.getByText('Pay Xcel bill')).toHaveCount(1);

  expect(new Set(sent.map((req) => new URL(req.url()).origin))).toEqual(new Set([ASSISTANT]));
  for (const req of sent) {
    const body = req.postData() ?? '';
    for (const word of ['Health', 'Home', 'Personal', 'Pay Xcel bill']) expect(body).not.toContain(word);
  }

  await page.reload();
  await page.goto('./#/lists');
  await page.getByRole('link', { name: /Work/ }).first().click();
  await expect(page.getByText('Pay Xcel bill')).toHaveCount(1);
});

test('the security policy allows only the assistant as an outside connection', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'self' https://app.80dventures.com;");
});
