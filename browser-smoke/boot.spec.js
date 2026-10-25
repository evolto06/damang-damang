import { test, expect } from '@playwright/test';

test('production load opens the menu, loads the model and starts a Bot Match', async ({
  page,
  baseURL,
}) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(`Page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`Console error: ${message.text()}`);
  });
  page.on('requestfailed', (request) =>
    failures.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  // Avoid Chromium's optional favicon probe becoming an unrelated resource error.
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  const modelResponse = page.waitForResponse(
    (response) => response.url() === new URL('models/spider.glb', baseURL).href,
  );
  await page.goto('./');
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#game')).toHaveClass(/at-menu/);
  await expect(page.locator('#match-ui')).toHaveAttribute('inert', '');
  await expect(page.locator('#scene')).toHaveAttribute('aria-hidden', 'true');
  const response = await modelResponse;
  expect(response.ok(), 'the production GLB resource loads').toBe(true);
  expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
  await expect(page.locator('#start-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#start-bot')).toBeEnabled();
  // Loading must leave the player on the menu until they choose a match.
  await expect(page.locator('#game')).toHaveClass(/at-menu/);
  await page.locator('#start-bot').click();
  await expect(page.locator('#start-screen')).toBeHidden();
  await expect(page.locator('#match-ui')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#scene')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#round-time')).not.toHaveText('60', { timeout: 5000 });
  expect(failures, 'no JavaScript or resource errors during boot and initial play').toEqual([]);
});
