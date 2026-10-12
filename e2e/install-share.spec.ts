import { expect, test, type Page } from '@playwright/test';

const STEPS: Record<string, string> = {
  'iphone-webkit': 'Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen.',
  chromium: 'Add to Home screen to keep your data safe. Tap ⋮, then Add to Home screen.',
};
const card = (page: Page) => page.getByRole('region', { name: 'Install this app' });
const nav = (page: Page, tab: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: tab }).click();

test('a browser tab shows install steps for this phone on Today only, until Got it', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(card(page)).toContainText(STEPS[test.info().project.name]!);

  await nav(page, 'Lists');
  await expect(page.getByRole('heading', { level: 1, name: 'Lists' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  await nav(page, 'Today');
  await card(page).getByRole('button', { name: 'Got it' }).click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test('Chrome’s install prompt is offered from the card', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'Only Chrome fires beforeinstallprompt');
  await page.goto('./');
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Install' })).toHaveCount(0);

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        Object.assign(window, { __prompted: true });
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });
  await card(page).getByRole('button', { name: 'Install' }).click();
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(
    true,
  );
});

test('Share this app sends the message and the app’s own link', async ({ page }) => {
  await page.addInitScript(() => {
    const sent: ShareData[] = [];
    Object.assign(window, { __sent: sent });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        sent.push(data);
      },
    });
  });
  await page.goto('./#/lists');
  const button = page.getByRole('button', { name: 'Share this app' });
  await button.click();
  const sent = await page.evaluate(() => (window as unknown as { __sent: ShareData[] }).__sent);
  const appUrl = new URL('./', page.url().split('#')[0]).href;
  expect(sent).toEqual([
    { title: 'Habit Tracker', text: `Try this habit and to-do tracker: ${appUrl}` },
  ]);
  expect(appUrl).not.toContain('#');

  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(43.5);
});

test('without a share sheet the link is copied', async ({ page }) => {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied.push(text);
        },
      },
    });
  });
  await page.goto('./#/lists');
  await page.getByRole('button', { name: 'Share this app' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied).toEqual([new URL('./', page.url().split('#')[0]).href]);
});
