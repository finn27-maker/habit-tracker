import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/habit-tracker/',
    serviceWorkers: 'allow',
  },
  projects: [
    // Playwright's WebKit can't drive service workers, so offline checks run in Chromium.
    // Blocked here because once one controls a page (from its second load on), WebKit stops
    // routing that page's cross-origin requests: a reload in an assistant test then reached
    // the real assistant instead of the test's stand-in.
    { name: 'iphone-webkit', use: { ...devices['iPhone 15'], serviceWorkers: 'block' } },
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/habit-tracker/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
