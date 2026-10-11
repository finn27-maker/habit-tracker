/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site at https://finn27-maker.github.io/habit-tracker/.
// The Vite base, manifest scope/start_url and service-worker scope must all match it.
const BASE = '/habit-tracker/';

export default defineConfig({
  base: BASE,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Habit Tracker',
        short_name: 'Habits',
        description: 'Daily habits, weekly goals and to-dos in one place.',
        id: BASE,
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      // App.svelte and main.ts only wire browser/PWA globals together; Playwright covers them.
      exclude: [
        'src/**/*.test.ts',
        'src/test-setup.ts',
        'src/main.ts',
        'src/App.svelte',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        // Overall bar. Branches are lower because Svelte's compiled templates contain
        // generated "did this value change?" branches that behaviour can't reach.
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 90,
        // The logic that decides streaks, resets and storage stays fully covered.
        'src/domain/**': { lines: 100, functions: 100, statements: 100, branches: 100 },
        'src/data/**': { lines: 100, functions: 100, statements: 100, branches: 100 },
        'src/platform/**': { lines: 100, functions: 100, statements: 100, branches: 100 },
      },
    },
  },
});
