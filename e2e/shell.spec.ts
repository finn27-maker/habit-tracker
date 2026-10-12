import { expect, test } from '@playwright/test';

test('launches to the Today view within 1000 ms', async ({ page }) => {
  const start = Date.now();
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(1000);
  await expect(
    page.getByText('Nothing here yet. Tap + to add your first habit or to-do.'),
  ).toBeVisible();
});

test('requests persistent storage once on first run', async ({ page }) => {
  // Init scripts re-run on every navigation, so count calls in sessionStorage.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persist: async () => {
          const calls = Number(sessionStorage.getItem('persistCalls') ?? '0');
          sessionStorage.setItem('persistCalls', String(calls + 1));
          return true;
        },
      },
    });
  });
  const persistCalls = () => page.evaluate(() => sessionStorage.getItem('persistCalls'));

  await page.goto('./');
  await expect.poll(persistCalls).toBe('1');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  expect(await persistCalls()).toBe('1');
});

test('serves a valid manifest scoped to /habit-tracker/', async ({ request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    start_url: '/habit-tracker/',
    scope: '/habit-tracker/',
    display: 'standalone',
  });
});

test('the page runs no inline scripts and only loads same-origin resources', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (req) => origins.add(new URL(req.url()).origin));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  expect(await page.locator('script:not([src])').count()).toBe(0);
  expect([...origins]).toEqual(['http://localhost:4173']);
});

test('confirms offline readiness, then works offline without an update check', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Service workers are only drivable in Chromium');
  await page.goto('./');
  await expect(page.getByRole('status')).toHaveText(/Ready to work offline/);

  await context.setOffline(true);
  const swRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/sw.js')) swRequests.push(req.url());
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  expect(swRequests).toEqual([]);
});
