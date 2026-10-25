import { defineConfig } from '@playwright/test';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'smoke-root', testDir: './browser-smoke', use: { baseURL: 'http://127.0.0.1:4175/' } },
    {
      name: 'smoke-nested',
      testDir: './browser-smoke',
      use: { baseURL: 'http://127.0.0.1:4174/damang-damang/' },
    },
    {
      name: 'desktop',
      testMatch: 'game.spec.js',
      use: { viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'short',
      testMatch: 'game.spec.js',
      use: { viewport: { width: 1024, height: 600 } },
    },
    {
      name: 'phone-landscape',
      testMatch: 'game.spec.js',
      use: {
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-portrait',
      testMatch: 'game.spec.js',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'production',
      testMatch: 'production.spec.js',
      use: {
        baseURL: 'http://127.0.0.1:4174/damang-damang/',
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
  webServer: [
    {
      command: 'node scripts/smoke-server.mjs 4175 /',
      url: 'http://127.0.0.1:4175/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `${npm} run dev -- --port 4173 --strictPort`,
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node scripts/serve-build.mjs',
      url: 'http://127.0.0.1:4174/damang-damang/',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
