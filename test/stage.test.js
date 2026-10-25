import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createWorld, stepWorld, COMBAT } from "../src/combat.js";
import { STAGES, sameStick, stickAt } from "../src/stage.js";
import { RULES } from "../src/movement.js";
import { createAI, decideAI } from "../src/ai.js";
import {
  createRuntime,
  setReady,
  frameRuntime,
  pauseRuntime,
  restartRuntime,
  queueAction,
} from "../src/runtime.js";
import { WEB, advanceWebs, headCenter } from "../src/web-attack.js";
import { BITE } from "../src/bite-profile.js";
import { followCameraFocus } from "../src/camera.js";
import { createHeldStick } from "../src/scene.js";

test("twin rails stop walking and dashes at the gap; restart selects a fresh layout through its existing third argument", () => {
  const world = createWorld("twin");
  for (let i = 0; i < 120; i++)
    stepWorld(world, [
      { direction: 1, dash: true },
      { direction: -1, dash: true },
    ]);
  assert.deepEqual(
    world.fighters.map((f) => f.x),
    [-0.75, 0.75],
  );
  assert.equal(
    sameStick(...world.fighters.map((f) => f.x), world.stage),
    false,
  );
  const runtime = createRuntime({ mode: "pvp", stage: "twin" });
  setReady(runtime, true);
  queueAction(runtime, 1, "bite", 1);
  runtime.world.remainingTicks = 1;
  pauseRuntime(runtime, true);
  for (const id of ["single", "twin", "single"]) {
    restartRuntime(runtime, 5000, id);
    assert.equal(runtime.stage, id);
    assert.equal(runtime.world.stage, STAGES[id]);
    assert.deepEqual(
      runtime.world.fighters.map((f) => f.x),
      [...STAGES[id].start],
    );
    assert.equal(runtime.world.remainingTicks, 3600);
    assert.equal(runtime.paused, false);
    assert.equal(runtime.mode, "pvp");
    assert.ok(runtime.controls.every((c) => c.inputs.length === 0));
  }
});

test("drop, steer and retrieval cross the twin gap in both directions and grip an actual rail", () => {
  for (const direction of [-1, 1]) {
    const world = createWorld("twin"),
      fighter = world.fighters[0];
    fighter.x = -direction * 0.75;
    world.fighters[1].x = direction * 8;
    stepWorld(world, [{ drop: true, direction }, {}]);
    const modes = new Set([fighter.air.mode]);
    for (let i = 0; i < 500 && fighter.air.mode !== "attached"; i++) {
      stepWorld(world, [{ direction, web: i === 35 }, {}]);
      modes.add(fighter.air.mode);
      assert.ok(Number.isFinite(fighter.x + fighter.air.y));
    }
    assert.deepEqual(
      [...modes],
      [
        "falling",
        "deploying",
        "swinging",
        "reeling",
        "reattaching",
        "attached",
      ],
    );
    assert.ok(fighter.x * direction > 0.75);
    assert.equal(sameStick(fighter.x, world.fighters[1].x, world.stage), true);
    const [low, high] = stickAt(fighter.x, world.stage);
    assert.ok(fighter.x >= low && fighter.x <= high);
  }
});

test("bot autonomously crosses either twin gap direction, retrieves and resumes combat", () => {
  for (const direction of [-1, 1]) {
    const world = createWorld("twin"),
      ai = createAI();
    world.fighters[0].x = direction * 6;
    world.fighters[1].x = -direction * 6;
    let dropped = false;
    for (let i = 0; i < 900 && world.fighters[0].hp === 100; i++) {
      stepWorld(world, [{}, decideAI(ai, world)]);
      dropped ||= world.fighters[1].air.mode !== "attached";
    }
    assert.ok(dropped);
    assert.equal(world.fighters[1].air.mode, "attached");
    assert.equal(
      sameStick(...world.fighters.map((f) => f.x), world.stage),
      true,
    );
    assert.equal(world.fighters[0].hp, 100 - COMBAT.damage);
  }
});

test("nonlethal bites in either heading detach only after hitstop, with outward momentum; trades detach both", () => {
  for (const direction of [-1, 1]) {
    for (const trade of [false, true]) {
      const world = createWorld();
      world.fighters[0].x = (-direction * RULES.separation) / 2;
      world.fighters[1].x = (direction * RULES.separation) / 2;
      for (let i = 0; i < 30 && !world.hitstop; i++)
        stepWorld(world, [{ bite: i === 0 }, { bite: trade && i === 0 }]);
      assert.equal(world.hitstop, COMBAT.hitstop);
      assert.equal(world.fighters[1].hp, 80);
      const positions = world.fighters.map((f) => f.x);
      for (let i = 1; i < COMBAT.hitstop; i++) {
        stepWorld(world);
        assert.deepEqual(
          world.fighters.map((f) => f.x),
          positions,
        );
        assert.ok(world.fighters.every((f) => f.air.mode === "attached"));
      }
      stepWorld(world);
      assert.equal(world.fighters[1].air.mode, "falling");
      assert.equal(Math.sign(world.fighters[1].air.vx), direction);
      assert.equal(world.fighters[0].air.mode, trade ? "falling" : "attached");
      if (trade) {
        assert.equal(world.fighters[0].hp, 80);
        assert.equal(Math.sign(world.fighters[0].air.vx), -direction);
      }
    }
  }
});

test("the final simulated second expires by health, including hitstop, and ended worlds remain frozen", () => {
  for (const [health, winner] of [
    [[100, 100], "draw"],
    [[80, 60], "player"],
    [[20, 40], "opponent"],
  ]) {
    const world = createWorld();
    world.remainingTicks = 60;
    world.fighters.forEach((f, i) => {
      f.hp = health[i];
    });
    world.hitstop = 6;
    for (let i = 0; i < 59; i++) {
      stepWorld(world);
      assert.equal(world.status, "playing");
    }
    stepWorld(world);
    assert.equal(world.remainingTicks, 0);
    assert.equal(world.status, "ended");
    assert.equal(world.endReason, "timeout");
    assert.equal(world.winner, winner);
    const frozen = structuredClone(world);
    stepWorld(world, [{ bite: true }, { dash: true }]);
    assert.deepEqual(world, frozen);
  }
});

test("the full 60-second timer is render independent and a paused minute consumes no round time", () => {
  const outcomes = [30, 60, 144].map((hz) => {
    const runtime = createRuntime({ mode: "pvp" });
    setReady(runtime, true);
    frameRuntime(runtime, 0);
    for (let frame = 1; frame <= hz * 30; frame++)
      frameRuntime(runtime, (frame * 1000) / hz);
    assert.equal(runtime.world.remainingTicks, 1800);
    pauseRuntime(runtime, true);
    frameRuntime(runtime, 90000);
    assert.equal(runtime.world.remainingTicks, 1800);
    pauseRuntime(runtime, false);
    frameRuntime(runtime, 90000);
    for (let frame = 1; frame <= hz * 30; frame++)
      frameRuntime(runtime, 90000 + (frame * 1000) / hz);
    assert.equal(runtime.world.tick, 3600);
    assert.equal(runtime.world.winner, "draw");
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test("a bolt clips its final sweep to range: edge contact hits but geometry beyond range never does", () => {
  for (const beyond of [false, true]) {
    const world = createWorld(),
      target = world.fighters[1];
    const radius = 0.82 * BITE.scale + WEB.radius;
    // Put the nearest surface just before/after the range limit; center is farther away.
    target.x =
      WEB.range + radius + 0.6 * BITE.scale + (beyond ? 0.005 : -0.005);
    const y = headCenter(target)[1];
    const shot = {
      source: 0,
      origin: [0, y, 0],
      position: [WEB.range - 0.05, y, 0],
      previous: [0, y, 0],
      velocity: [WEB.speed / 60, 0, 0],
      travelled: WEB.range - 0.05,
      age: 20,
    };
    world.projectiles = [shot];
    const hits = advanceWebs(world, structuredClone(world.fighters));
    assert.equal(shot.position[0], WEB.range);
    assert.equal(shot.travelled, WEB.range);
    assert.equal(hits.length, beyond ? 0 : 1);
    assert.equal(world.projectiles.length, 0);
  }
});

test("camera easing matches render rates and changed layouts rebuild visible twig extents", () => {
  const fighters = [{ x: -2 }, { x: 3 }];
  const focuses = [30, 60, 144].map((hz) => {
    const focus = { x: 0, halfSpan: 12 };
    for (let frame = 0; frame < hz; frame++)
      followCameraFocus(focus, fighters, STAGES.twin, 1 / hz);
    assert.ok(focus.halfSpan >= 3.7);
    return focus;
  });
  for (const focus of focuses) {
    assert.ok(Math.abs(focus.x - focuses[0].x) < 1e-10);
    assert.ok(Math.abs(focus.halfSpan - focuses[0].halfSpan) < 1e-10);
  }
  const root = createHeldStick(new THREE.Scene());
  for (const stage of [STAGES.twin, STAGES.single, STAGES.twin]) {
    const oldTwigs = root.children.filter((node) => node.name === "Twig");
    let disposed = 0;
    oldTwigs.forEach((twig) => {
      twig.geometry.addEventListener("dispose", () => disposed++);
    });
    root.setStage(stage);
    assert.equal(disposed, oldTwigs.length);
    const twigs = root.children.filter((node) => node.name === "Twig");
    assert.equal(twigs.length, stage.sticks.length);
    twigs.forEach((twig, i) => {
      const [left, right] = stage.sticks[i].body;
      assert.equal(twig.position.x, (left + right) / 2);
      assert.equal(twig.geometry.parameters.height, right - left);
    });
    assert.equal(
      root.children.find((node) => node.name === "Left holder").visible,
      stage.id === "twin",
    );
  }
});
