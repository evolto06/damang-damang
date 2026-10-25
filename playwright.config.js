import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    ...[
      ['desktop', 1366, 768, false],
      ['short', 1024, 600, false],
      ['phone-landscape', 844, 390, true],
      ['phone-portrait', 390, 844, true],
    ].map(([name, width, height, touch]) => ({
      name,
      testMatch: '**/e2e/game.spec.js',
      use: {
        baseURL: 'http://127.0.0.1:4175/',
        viewport: { width, height },
        isMobile: touch,
        hasTouch: touch,
      },
    })),
    {
      name: 'production',
      testMatch: '**/e2e/production.spec.js',
      use: { baseURL: 'http://127.0.0.1:4174/damang-damang/' },
    },
    {
      name: 'root',
      testMatch: '**/browser-smoke/boot.spec.js',
      use: { baseURL: 'http://127.0.0.1:4173/' },
    },
    {
      name: 'nested',
      testMatch: '**/browser-smoke/boot.spec.js',
      use: { baseURL: 'http://127.0.0.1:4174/damang-damang/' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175/',
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/smoke-server.mjs 4173 /',
      url: 'http://127.0.0.1:4173/',
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/smoke-server.mjs 4174 /damang-damang/',
      url: 'http://127.0.0.1:4174/damang-damang/',
      reuseExistingServer: false,
    },
  ],
});
