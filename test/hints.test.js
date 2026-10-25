import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, COMBAT } from "../src/combat.js";
import { RULES } from "../src/movement.js";
import { keysFor, hintsFor, fightFeedback } from "../src/feedback.js";
import { createRuntime, setReady } from "../src/runtime.js";

const closeWorld = () => {
  const world = createWorld();
  world.fighters[0].x = 0;
  world.fighters[1].x = RULES.separation + COMBAT.reach / 2;
  return world;
};

test("both PvP players and optional input sources receive their actual bite binding", () => {
  const world = closeWorld();
  for (const [mode, player, source, expected] of [
    ["bot", 0, "keyboard", "J"],
    ["pvp", 0, "keyboard", "Q"],
    ["pvp", 1, "keyboard", ","],
    ["pvp", 1, "controller", "X / Left"],
    ["pvp", 0, "touch", "Bite"],
  ]) {
    const [hint] = hintsFor(world, player, mode, source);
    assert.equal(hint.action, "bite");
    assert.equal(hint.key, expected);
  }
  assert.deepEqual(
    ["bite", "shoot", "dash", "web"].map(
      (action) => keysFor("pvp", 1, "controller")[action],
    ),
    ["X / Left", "Y / Top", "A / Bottom", "B / Right"],
  );
});

test("return and blocked climb hints use the open direction and active bindings", () => {
  const world = closeWorld(),
    fighter = world.fighters[1];
  fighter.air.mode = "falling";
  assert.equal(hintsFor(world, 1, "pvp")[0].key, "↑");
  fighter.air.mode = "reeling";
  fighter.air.blocked = true;
  for (const [direction, key] of [
    [-1, "←"],
    [1, "→"],
    [0, "← / →"],
  ]) {
    fighter.air.clearDirection = direction;
    assert.equal(hintsFor(world, 1, "pvp")[0].key, key);
  }
  fighter.air.blocked = false;
  assert.equal(hintsFor(world, 1, "pvp", "controller")[0].key, "D-pad ← / →");
  fighter.air.mode = "grounded";
  assert.equal(hintsFor(world, 1, "pvp", "touch")[0].text, "Return");
});

test("hints respect real bite distance, recovery, return hold and frozen simulation", () => {
  const world = closeWorld(),
    fighter = world.fighters[0],
    opponent = world.fighters[1];
  opponent.x = RULES.separation + COMBAT.reach + 0.01;
  assert.deepEqual(hintsFor(world), []);
  opponent.phase = "webstun";
  assert.deepEqual(
    hintsFor(world).map((hint) => hint.action),
    ["move", "bite"],
  );
  for (const phase of ["recovery", "hitstun", "webstun"]) {
    fighter.phase = phase;
    assert.deepEqual(hintsFor(world), []);
  }
  fighter.phase = "idle";
  opponent.air.mode = "reeling";
  assert.deepEqual(hintsFor(world), []);
  opponent.air.mode = "attached";
  world.hitstop = 1;
  assert.deepEqual(hintsFor(world), []);
  world.hitstop = 0;
  world.status = "ended";
  assert.deepEqual(hintsFor(world), []);
});

test("twin arena prompts approach and crossing rather than a bite across separate sticks", () => {
  const world = createWorld("twin");
  assert.equal(hintsFor(world)[0].verb, "Approach gap");
  world.fighters[0].x = -0.75;
  world.fighters[1].x = 0.75;
  assert.deepEqual(
    hintsFor(world).map((hint) => hint.action),
    ["drop"],
  );
  assert.deepEqual(
    hintsFor(world, 1, "pvp").map((hint) => hint.action),
    ["drop"],
  );
});

test("feedback return text cannot throw and uses controller or PvP directions", () => {
  const runtime = createRuntime({ mode: "pvp" });
  setReady(runtime, true);
  runtime.world.fighters[0].air.mode = "falling";
  assert.match(fightFeedback(runtime).prompt, /W \/ Web/);
  runtime.inputSources = ["controller"];
  assert.match(fightFeedback(runtime).prompt, /B \/ Right/);
  Object.assign(runtime.world.fighters[0].air, {
    mode: "reeling",
    blocked: true,
    clearDirection: 1,
  });
  assert.match(fightFeedback(runtime).prompt, /D-pad →/);
  assert.doesNotMatch(fightFeedback(runtime).prompt, /A \/ D/);
});
