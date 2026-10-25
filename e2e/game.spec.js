import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.__spiderDerby.getState());
async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#start-bot')).toBeEnabled();
}

test('load, move, pause, resume and change arena without console errors', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.locator('#stage-choice').selectOption('terraces');
  await page.locator('#start-bot').click();
  await expect(page.locator('#stage-name')).toHaveText('Terraces');
  const before = (await state(page)).fighters[0].x;
  await page.keyboard.down('d');
  await expect.poll(async () => (await state(page)).fighters[0].x).toBeGreaterThan(before + 0.1);
  await page.keyboard.up('d');
  await page.locator('#pause').click();
  const paused = (await state(page)).tick;
  await page.waitForTimeout(160);
  expect((await state(page)).tick).toBe(paused);
  await page.locator('#button-hints').uncheck();
  await page.locator('#resume').click();
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(paused);
  await page.locator('#pause').click();
  await page.locator('#change-mode').click();
  await page.locator('#stage-choice').selectOption('twin');
  await page.locator('#start-bot').click();
  expect((await state(page)).stage.id).toBe('twin');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const screens = window.__spiderDerby.inspectScene().fighterScreens;
        return ['player-marker', 'opponent-marker'].every(
          (id, i) => document.getElementById(id).getBoundingClientRect().bottom < screens[i].top,
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('arena.png') });
  await page.locator('#pause').click();
  await expect(page.locator('#button-hints')).not.toBeChecked();
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
  expect(errors).toEqual([]);
});

test('drop turns upright, pavement hurts, and one web press returns to a real twig', async ({
  page,
}) => {
  // A quiet PvP opponent lets this check observe the completed return without
  // a bot immediately landing a fresh knock-off between assertion polls.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [
        {
          index: 0,
          id: 'Recovery test pad',
          mapping: 'standard',
          connected: true,
          axes: [0, 0],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
        },
      ],
    });
  });
  await ready(page);
  await expect(page.locator('#start-pvp')).toBeEnabled();
  await page.locator('#start-pvp').click();
  await page.locator('#drop').click();
  await expect.poll(async () => (await state(page)).fighters[0].air.mode).toBe('grounded');
  const grounded = (await state(page)).fighters[0];
  expect(grounded.hp).toBeLessThanOrEqual(90);
  const p2Start = (await state(page)).fighters[1].x;
  await page.locator('#web').click();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).fighters[1].x).toBeGreaterThan(p2Start + 0.05);
  expect((await state(page)).fighters[0].air.mode).not.toBe('attached');
  await page.keyboard.up('ArrowRight');
  await expect
    .poll(async () => (await state(page)).fighters[0].air.mode, {
      timeout: 20_000,
    })
    .toBe('attached');
  expect((await state(page)).fighters[0].hp).toBeGreaterThan(0);
});

test('touch PvP supplies both players; keyboard PvP uses both players own bindings', async ({
  page,
}, info) => {
  await ready(page);
  if (info.project.use.hasTouch) {
    await expect(page.locator('#start-pvp')).toBeEnabled();
    await page.locator('#start-pvp').click();
    await expect(page.locator('#p2-controls')).toBeVisible();
    await page.locator('#bite').tap();
    await page.locator('#p2-controls [data-action="bite"]').tap();
    await expect
      .poll(async () => (await state(page)).fighters.map((f) => f.attackId))
      .toEqual([1, 1]);
    await page.locator('#pause').click();
    await page.locator('#touch-pvp').uncheck();
    await page.locator('#change-mode').click();
    await expect(page.locator('#start-pvp')).toBeDisabled();
    await expect(page.locator('#pvp-note')).toContainText('controller');
  } else {
    await page.locator('#start-pvp').click();
    await page.keyboard.press('q');
    await page.keyboard.press(',');
    await expect
      .poll(async () => (await state(page)).fighters.map((f) => f.attackId))
      .toEqual([1, 1]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pvp-help')).toBeVisible();
  }
});

test('stepped arena and first-match coaching survive menu transitions and a reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.locator('#stage-choice').selectOption('heights');
  await page.locator('#start-bot').click();
  await expect(page.locator('#stage-name')).toHaveText('Stepped sticks');
  await expect(page.locator('#coaching-panel')).toBeVisible();
  const first = await state(page);
  expect(first.series.wins).toEqual([0, 0]);
  expect(first.fighters.map((f) => f.air.y)).toEqual([-0.9, 0.9]);
  await page.locator('#skip-coaching').click();
  await expect(page.locator('#coaching-panel')).toBeHidden();
  await page.reload();
  await expect(page.locator('#start-bot')).toBeEnabled();
  await expect(page.locator('#coaching-choice')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('a missing model exposes a reload action', async ({ page }) => {
  await page.route('**/models/spider.glb', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#start-status')).toContainText('could not load');
  await expect(page.locator('#start-retry')).toBeVisible();
  await expect(page.locator('#start-bot')).toBeDisabled();
});

test('a lone virtual controller drives PvP P2 and navigates the pause menu', async ({ page }) => {
  await page.addInitScript(() => {
    window.__testPads = [];
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => window.__testPads,
    });
  });
  await ready(page);
  const setPad = async (held = [], axes = [0, 0]) => {
    await page.evaluate(
      ({ held, axes }) => {
        window.__testPads = [
          {
            index: 0,
            id: 'Virtual standard controller',
            mapping: 'standard',
            connected: true,
            axes,
            buttons: Array.from({ length: 17 }, (_, i) => ({
              pressed: held.includes(i),
              value: held.includes(i) ? 1 : 0,
            })),
          },
        ];
      },
      { held, axes },
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  await setPad();
  await expect(page.locator('#start-pvp')).toBeEnabled();
  await page.locator('#start-pvp').click();
  await expect(page.locator('#overlay [data-controller-status]')).toContainText(
    'P2: controller ready',
  );
  await setPad([2]);
  await expect
    .poll(async () => (await state(page)).fighters.map((f) => f.attackId))
    .toEqual([0, 1]);
  await setPad();
  await expect.poll(async () => (await state(page)).fighters[1].phase).toBe('idle');
  const startX = (await state(page)).fighters[1].x;
  await setPad([], [0.8, 0]);
  await expect.poll(async () => (await state(page)).fighters[1].x).toBeGreaterThan(startX + 0.05);
  await setPad();
  await page.waitForTimeout(100);
  await setPad([9]);
  await expect(page.locator('#overlay')).toBeVisible();
  await setPad();
  await expect(page.locator('#overlay [data-controller-status]')).toContainText('controller ready');
  await setPad([13]);
  await expect(page.locator('#dialog-restart')).toBeFocused();
  await setPad();
  await page.waitForTimeout(120);
  await setPad([13]);
  await expect(page.locator('#change-mode')).toBeFocused();
  await setPad();
  await page.waitForTimeout(120);
  await setPad([0]);
  await expect(page.locator('#start-screen')).toBeVisible();
});
