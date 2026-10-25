import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld, clearGap, COMBAT } from "../src/combat.js";
import { RULES } from "../src/movement.js";
import { AIR, silkEndpoints } from "../src/aerial.js";
import { createAI, decideAI, AI_RULES } from "../src/ai.js";
import {
  createRuntime,
  setReady,
  frameRuntime,
  queueAction,
  queueDirection,
} from "../src/runtime.js";
import { fightFeedback } from "../src/feedback.js";

test("real timestamped approach/drop/D/C crosses beneath AI and lands opposite at 30/60/144Hz", () => {
  const outcomes = [30, 60, 144].map((hz) => {
    const runtime = createRuntime({
      createOpponent: createAI,
      decideOpponent: decideAI,
    });
    setReady(runtime, true);
    frameRuntime(runtime, 0);
    queueDirection(runtime, 0, 1, 1);
    queueAction(runtime, 0, "drop", 1417);
    queueAction(runtime, 0, "web", 2084);
    let crossed = false,
      blocked = false,
      gripped = false,
      anchor;
    for (let frame = 1; frame <= hz * 4.5; frame++) {
      frameRuntime(runtime, (frame * 1000) / hz);
      const [player, other] = runtime.world.fighters;
      if (player.air.mode !== "attached") {
        const endpoints = silkEndpoints(player);
        if (endpoints.visible && player.air.mode !== "deploying") {
          if (!anchor) anchor = endpoints.anchor;
          assert.deepEqual(
            endpoints.anchor,
            anchor,
            "fixed cast anchor never teleports",
          );
        }
        assert.deepEqual(
          [player.forward, other.forward],
          [1, -1],
          "silk-facing stays fixed throughout flight and grip",
        );
        if (player.x > other.x) crossed = true;
        if (Math.abs(player.x - other.x) < RULES.separation)
          assert.ok(player.air.y <= -AIR.clearance + 1e-9);
        if (player.air.blocked) {
          blocked = true;
          assert.match(fightFeedback(runtime).prompt, /Steer A/);
          assert.equal(fightFeedback(runtime).movementDisabled, false);
        }
      } else if (crossed) {
        gripped = true;
        assert.ok(player.x > other.x + RULES.separation - 1e-9);
        assert.deepEqual([player.forward, other.forward], [-1, 1]);
        assert.equal(silkEndpoints(player).visible, false);
      }
    }
    assert.ok(crossed && gripped);
    assert.ok(runtime.world.fighters[0].x > runtime.world.fighters[1].x);
    assert.equal(runtime.world.tick, 270);
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test("a short fall cast under an adjacent opponent steers clear and grips on the far side", () => {
  const world = createWorld(),
    player = world.fighters[0],
    other = world.fighters[1];
  player.x = other.x - RULES.separation;
  stepWorld(world, [{ drop: true }, {}]);
  for (let i = 0; i < 20; i++) stepWorld(world);
  let crossed = false;
  for (let i = 0; i < 300 && player.air.mode !== "attached"; i++) {
    stepWorld(world, [{ web: i === 0, direction: 1 }, {}]);
    if (player.air.mode !== "attached" && player.x > other.x) crossed = true;
  }
  assert.ok(crossed, "the swing/reel carries the spider past the opponent");
  assert.equal(player.air.mode, "attached");
  assert.ok(player.x > other.x + RULES.separation - 1e-9);
  assert.deepEqual(
    world.fighters.map((f) => f.forward),
    [-1, 1],
  );
});

test("reversed attached order blocks walking/dashing through contact; idle dash faces opponent", () => {
  const world = createWorld();
  world.fighters[0].x = 1;
  world.fighters[1].x = -1;
  for (let i = 0; i < 180; i++)
    stepWorld(world, [{ direction: -1 }, { direction: 1 }]);
  assert.ok(
    world.fighters[0].x - world.fighters[1].x >= RULES.separation - 1e-9,
  );
  assert.deepEqual(
    world.fighters.map((f) => f.forward),
    [-1, 1],
  );
  assert.ok(clearGap(world) < 1e-8);
  const separate = createWorld();
  separate.fighters[0].x = 2;
  separate.fighters[1].x = -2;
  stepWorld(separate, [{ dash: true }, { dash: true }]);
  for (let t = 0; t < COMBAT.lungewindup; t++) stepWorld(separate);
  assert.ok(separate.fighters[0].x < 2 && separate.fighters[1].x > -2);
});

test("AI approaches and bites rightward after crossing, with full return grace", () => {
  const world = createWorld(),
    ai = createAI();
  world.tick = 100;
  world.fighters[0].air.mode = "falling";
  decideAI(ai, world);
  world.fighters[0].air.mode = "attached";
  world.fighters[0].x = 2;
  world.fighters[1].x = -2;
  assert.equal(decideAI(ai, world).direction, 0);
  assert.equal(ai.readyAt, world.tick + AI_RULES.decisionDelay);
  world.tick = ai.readyAt;
  assert.equal(decideAI(ai, world).direction, 1);
  for (let i = 0; i < 240 && world.fighters[0].hp === 100; i++)
    stepWorld(world, [{}, decideAI(ai, world)]);
  assert.equal(world.fighters[0].hp, 100 - COMBAT.damage);
});
