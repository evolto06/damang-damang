import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-smoke',
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
    { name: 'root', use: { baseURL: 'http://127.0.0.1:4173/' } },
    { name: 'nested', use: { baseURL: 'http://127.0.0.1:4174/damang-damang/' } },
  ],
  webServer: [
    { command: 'node scripts/smoke-server.mjs 4173 /', url: 'http://127.0.0.1:4173/', reuseExistingServer: false },
    { command: 'node scripts/smoke-server.mjs 4174 /damang-damang/', url: 'http://127.0.0.1:4174/damang-damang/', reuseExistingServer: false },
  ],
});
