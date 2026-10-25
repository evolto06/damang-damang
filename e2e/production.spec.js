import { test, expect } from "@playwright/test";

test("production loads and plays from a project subfolder", async ({
  page,
}) => {
  const failures = [],
    errors = [];
  page.on("requestfailed", (request) => failures.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#start-bot")).toBeEnabled();
  await page.locator("#stage-choice").selectOption("terraces");
  await page.locator("#start-bot").click();
  await expect(page.locator("#match-ui")).not.toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await page.locator("#pause").click();
  await expect(page.locator("#overlay")).toBeVisible();
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test("a failed module exposes independent boot recovery", async ({ page }) => {
  await page.clock.install();
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.goto("./");
  await page.clock.fastForward(15_100);
  await expect(page.locator("#start-status")).toContainText("too long");
  await expect(page.locator("#start-retry")).toBeVisible();
});
