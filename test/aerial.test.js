import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, COMBAT } from '../src/combat.js';
import { RULES } from '../src/movement.js';
import { AIR, isAttached, silkEndpoints, outletOffset, stickSurfaceY } from '../src/aerial.js';
import { createAI, decideAI } from '../src/ai.js';
import {
  createRuntime,
  setReady,
  queueAction,
  queueDirection,
  frameRuntime,
  pauseRuntime,
  restartRuntime,
} from '../src/runtime.js';
import { fightFeedback } from '../src/feedback.js';

const tick = (world, count, actions = [{}, {}]) => {
  for (let i = 0; i < count; i++) stepWorld(world, actions);
};
test('drop releases under gravity with retained momentum; it wins simultaneous web/bite/dash', () => {
  const world = createWorld(),
    player = world.fighters[0];
  player.velocity = 2;
  stepWorld(world, [{ drop: true, web: true, bite: true, dash: true }, {}]);
  assert.equal(player.air.mode, 'falling');
  assert.ok(player.air.y < 0 && player.air.vy < 0);
  assert.ok(player.air.vx > 1.9);
  assert.equal(player.attackId, 0);
  assert.equal(player.dashRemaining, 0);
  const y = player.air.y,
    speed = player.air.vy;
  stepWorld(world);
  assert.ok(player.air.y < y && player.air.vy < speed);
  assert.equal(silkEndpoints(player).visible, false);
});
test('falling reaches the visible ground and stays recoverable before the round expires', () => {
  const world = createWorld();
  stepWorld(world, [{ drop: true }, {}]);
  tick(world, 90);
  const player = world.fighters[0],
    ground = structuredClone(player.air);
  assert.equal(ground.mode, 'grounded');
  assert.equal(ground.y, AIR.groundY);
  tick(world, 30);
  assert.equal(player.air.y, ground.y);
  assert.equal(player.hp, 90);
  assert.equal(world.status, 'playing');
  stepWorld(world, [{ web: true }, {}]);
  assert.equal(player.air.mode, 'deploying');
  for (let i = 0; i < 360 && !isAttached(player); i++) stepWorld(world);
  assert.equal(player.air.mode, 'attached');
  assert.equal(player.air.y, 0);
});
test('one C press deploys, swings, climbs and smoothly reattaches both endpoint fighters without crossing', () => {
  for (const index of [0, 1])
    for (const endpoint of [-1, 1]) {
      const world = createWorld(),
        player = world.fighters[index],
        other = world.fighters[1 - index];
      player.x = endpoint * RULES.limit;
      other.x = player.x + (index ? -1 : 1) * RULES.separation;
      if (Math.abs(other.x) > RULES.limit) {
        other.x = endpoint * RULES.limit;
        player.x = other.x + (index ? 1 : -1) * RULES.separation;
      }
      player.velocity = endpoint * 2;
      const actions = [{}, {}];
      actions[index] = { drop: true };
      stepWorld(world, actions);
      tick(world, 35);
      actions[index] = { web: true };
      stepWorld(world, actions);
      const seen = new Set([player.air.mode]);
      let maxLandingStep = 0;
      for (let i = 0; i < 500 && !isAttached(player); i++) {
        const old = { x: player.x, y: player.air.y, mode: player.air.mode };
        stepWorld(world);
        seen.add(player.air.mode);
        assert.ok(world.fighters[1].x - world.fighters[0].x >= RULES.separation - 1e-8);
        assert.ok(Math.abs(player.x) <= RULES.limit && Number.isFinite(player.air.y));
        if (['swinging', 'reeling'].includes(player.air.mode)) {
          const endpoints = silkEndpoints(player);
          assert.ok(
            Math.hypot(...endpoints.origin.map((value, axis) => value - endpoints.anchor[axis])) <=
              player.air.ropeLength + 1e-6,
          );
        }
        if (old.mode === 'reattaching')
          maxLandingStep = Math.max(
            maxLandingStep,
            Math.hypot(player.x - old.x, player.air.y - old.y),
          );
      }
      assert.ok(
        ['deploying', 'swinging', 'reeling', 'reattaching', 'attached'].every((mode) =>
          seen.has(mode),
        ),
      );
      assert.ok(Math.abs(player.x) <= RULES.limit + 1e-9);
      assert.ok(maxLandingStep < 0.05);
    }
});
test('the sixth cast tick attaches visible silk into a momentum-preserving swing before the winch', () => {
  for (const grounded of [false, true])
    for (const direction of [-1, 0, 1]) {
      const world = createWorld(),
        player = world.fighters[0];
      if (!grounded) player.velocity = 2;
      stepWorld(world, [{ drop: true }, {}]);
      tick(world, grounded ? 180 : 25);
      assert.equal(player.air.mode, grounded ? 'grounded' : 'falling');
      const action = [{ web: true, direction }, {}];
      for (let castTick = 1; castTick < AIR.deployTicks; castTick++) {
        stepWorld(world, action);
        assert.equal(player.air.mode, 'deploying');
        const { origin, anchor, end } = silkEndpoints(player);
        for (let axis = 0; axis < 3; axis++) {
          assert.ok(
            Math.abs(
              end[axis] -
                origin[axis] -
                ((anchor[axis] - origin[axis]) * castTick) / AIR.deployTicks,
            ) < 1e-9,
          );
        }
      }
      const energy = Math.hypot(player.air.vx, player.air.vy);
      stepWorld(world, action);
      assert.equal(player.air.mode, 'swinging');
      // A taut catch can redirect the fall but never adds speed or snaps straight
      // into the winch rate.
      assert.ok(Math.hypot(player.air.vx, player.air.vy) <= energy + 0.25);
      assert.ok(Math.abs(player.air.vy - AIR.reelSpeed) > 1e-6);
      const { origin, anchor, end } = silkEndpoints(player);
      assert.ok(end.every((value, axis) => Math.abs(value - anchor[axis]) < 1e-9));
      assert.ok(
        Math.abs(
          Math.hypot(...origin.map((value, axis) => value - anchor[axis])) - player.air.ropeLength,
        ) < 1e-9,
      );
      let sawReel = false,
        lastY = player.air.y,
        lastMode = player.air.mode;
      for (let i = 0; i < 400 && !isAttached(player); i++) {
        stepWorld(world, action);
        if (lastMode === 'reeling' && player.air.mode === 'reeling') {
          sawReel = true;
          assert.ok(player.air.y >= lastY - 1e-9);
          assert.ok(player.air.y - lastY <= AIR.reelSpeed / 60 + 1e-9);
        }
        if (player.air.mode === 'reeling') sawReel = true;
        lastY = player.air.y;
        lastMode = player.air.mode;
      }
      assert.ok(sawReel);
      assert.equal(player.air.mode, 'attached');
    }
});

test('silk fires from the cast spinneret and keeps forward momentum instead of pulling back to the drop point', () => {
  const world = createWorld(),
    player = world.fighters[0];
  player.velocity = 2;
  stepWorld(world, [{ drop: true }, {}]);
  tick(world, 20);
  const dropAnchor = player.air.anchorX;
  const castAnchor = player.x + outletOffset(player)[0];
  assert.ok(castAnchor - dropAnchor > 0.4, 'the spider has drifted away from where it dropped');
  for (let i = 0; i < AIR.deployTicks; i++) stepWorld(world, [{ web: true }, {}]);
  assert.equal(player.air.mode, 'swinging');
  assert.ok(
    silkEndpoints(player).anchor[0] > castAnchor,
    'anchor tracks the spinneret during deployment',
  );
  const fixedAnchor = silkEndpoints(player).anchor;
  for (let i = 0; i < 10; i++) {
    stepWorld(world);
    assert.deepEqual(silkEndpoints(player).anchor, fixedAnchor);
  }
  assert.ok(player.air.vx > 1, 'forward speed survives the catch');
});

test('airborne spiders cannot bite/dash/be hit; AI immediately holds and leaves return grace', () => {
  const world = createWorld(),
    ai = createAI();
  world.fighters[0].x = 0;
  world.fighters[1].x = RULES.separation;
  world.fighters[1].velocity = -2;
  world.tick = 120;
  stepWorld(world, [{ drop: true }, { bite: true, direction: -1 }]);
  const opponentX = world.fighters[1].x;
  for (let i = 0; i < 90; i++) {
    const action = decideAI(ai, world);
    assert.equal(action.direction, 0);
    assert.equal(action.bite, false);
    stepWorld(world, [
      { bite: true, dash: true },
      { bite: true, direction: -1 },
    ]);
  }
  assert.equal(world.fighters[1].x, opponentX);
  assert.deepEqual(
    world.fighters.map((f) => [f.hp, f.attackId]),
    [
      [90, 0],
      [100, 0],
    ],
  );
  stepWorld(world, [{ web: true }, {}]);
  for (let i = 0; i < 500 && !isAttached(world.fighters[0]); i++)
    stepWorld(world, [{}, decideAI(ai, world)]);
  assert.equal(decideAI(ai, world).bite, false);
});
test('C spam does not restart the cast/reel; repeated complete drop-return cycles remain finite', () => {
  const world = createWorld();
  for (let cycle = 0; cycle < 5; cycle++) {
    stepWorld(world, [{ drop: true }, {}]);
    tick(world, 5);
    let ticks = 0;
    while (!isAttached(world.fighters[0]) && ticks++ < 500) {
      stepWorld(world, [{ web: true, direction: Math.sin(ticks) }, {}]);
      assert.ok(Number.isFinite(world.fighters[0].air.ropeLength));
    }
    assert.ok(ticks < 500);
    assert.equal(world.fighters[0].air.mode, 'attached');
  }
});
test('drop/web timestamps remain render independent at 30/60/144Hz, including no-tick edges', () => {
  const script = [
    [90, 'drop'],
    [235, 'direction', -1],
    [425, 'web'],
    [905, 'direction', 1],
    [920, 'web'],
    [1201, 'direction', 0],
  ];
  const outcomes = [30, 60, 144].map((hz) => {
    const runtime = createRuntime();
    setReady(runtime, true);
    frameRuntime(runtime, 0);
    let next = 0;
    for (let frame = 1; frame <= hz * 5; frame++) {
      const now = (frame * 1000) / hz;
      while (next < script.length && script[next][0] <= now) {
        const [at, kind, value] = script[next++];
        if (kind === 'direction') queueDirection(runtime, 0, value, at);
        else queueAction(runtime, 0, kind, at);
      }
      frameRuntime(runtime, now);
    }
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
  const runtime = createRuntime();
  setReady(runtime, true);
  frameRuntime(runtime, 0);
  queueAction(runtime, 0, 'drop', 5);
  frameRuntime(runtime, 7);
  assert.equal(runtime.world.fighters[0].air.mode, 'attached');
  frameRuntime(runtime, 17);
  assert.equal(runtime.world.fighters[0].air.mode, 'falling');
});
test('pause/hitstop/ended rounds freeze aerial physics; reset clears thread and transient inputs', () => {
  const runtime = createRuntime();
  setReady(runtime, true);
  frameRuntime(runtime, 0);
  queueAction(runtime, 0, 'drop', 1);
  frameRuntime(runtime, 50);
  queueAction(runtime, 0, 'web', 51);
  frameRuntime(runtime, 100);
  const beforeInvalid = structuredClone(runtime.world);
  for (const invalid of [NaN, Infinity, -1000]) frameRuntime(runtime, invalid);
  assert.deepEqual(runtime.world, beforeInvalid);
  pauseRuntime(runtime, true);
  const frozen = structuredClone(runtime.world);
  frameRuntime(runtime, 10000);
  assert.deepEqual(runtime.world, frozen);
  pauseRuntime(runtime, false);
  frameRuntime(runtime, 11000);
  assert.deepEqual(runtime.world, frozen);
  runtime.world.hitstop = COMBAT.hitstop;
  const air = structuredClone(runtime.world.fighters[0].air);
  tick(runtime.world, COMBAT.hitstop);
  assert.deepEqual(runtime.world.fighters[0].air, air);
  runtime.world.status = 'ended';
  const ended = structuredClone(runtime.world);
  tick(runtime.world, 60);
  assert.deepEqual(runtime.world, ended);
  restartRuntime(runtime);
  assert.equal(runtime.world.fighters[0].air.mode, 'attached');
  assert.equal(silkEndpoints(runtime.world.fighters[0]).visible, false);
  assert.equal(runtime.controls[0].inputs.length, 0);
});

// Start from a known physical pose, independent of falling/casting timings.
function pendulumWorld(angle = 0, speed = 0, length = 1.7, mode = 'swinging') {
  const world = createWorld(),
    fighter = world.fighters[0],
    offset = outletOffset(fighter);
  const centerX = -2,
    anchorY = -0.065;
  fighter.x = centerX + length * Math.sin(angle);
  Object.assign(fighter.air, {
    mode,
    y: anchorY - offset[1] - length * Math.cos(angle),
    vx: speed * Math.cos(angle),
    vy: speed * Math.sin(angle),
    anchorX: centerX + offset[0],
    anchorY,
    anchorZ: offset[2],
    ropeLength: length,
    landingX: centerX,
  });
  return world;
}
test('unpowered silk follows a taut pendulum arc until gravity reverses it and the winch engages', () => {
  const world = pendulumWorld(0.65),
    fighter = world.fighters[0],
    startY = fighter.air.y;
  const positions = [],
    horizontal = [],
    vertical = [];
  for (let i = 0; i < AIR.swingTicks && fighter.air.mode === 'swinging'; i++) {
    stepWorld(world);
    positions.push(fighter.x);
    horizontal.push(fighter.air.vx);
    vertical.push(fighter.air.vy);
    const { origin, anchor } = silkEndpoints(fighter);
    const delta = origin.map((value, axis) => value - anchor[axis]);
    assert.ok(Math.abs(Math.hypot(...delta) - fighter.air.ropeLength) < 1e-9);
    assert.ok(Math.abs(delta[0] * fighter.air.vx + delta[1] * fighter.air.vy) < 1e-8);
  }
  assert.ok(AIR.swingTicks >= 120);
  assert.ok(positions.length >= AIR.swingMinTicks);
  assert.ok(Math.max(...positions) - Math.min(...positions) > 1);
  assert.ok(positions.at(-1) < -2);
  assert.ok(horizontal[0] < 0 && vertical[0] < 0);
  assert.ok(vertical.at(-1) > 0);
  assert.ok(fighter.air.y < startY);
  assert.equal(fighter.air.mode, 'reeling');
});
test('A/D applies opposing tangential force and a released pump retains swing momentum', () => {
  const left = pendulumWorld(),
    right = pendulumWorld(),
    neutral = pendulumWorld();
  tick(left, 15, [{ direction: -1 }, {}]);
  tick(right, 15, [{ direction: 1 }, {}]);
  tick(neutral, 30);
  const pulseX = right.fighters[0].x;
  tick(left, 15);
  tick(right, 15);
  assert.ok(right.fighters[0].x > pulseX + 0.1);
  assert.ok(right.fighters[0].air.vx > 0.25);
  assert.ok(Math.abs(left.fighters[0].x + right.fighters[0].x + 4) < 1e-9);
  assert.equal(neutral.fighters[0].x, -2);
});
test('powered reeling climbs at constant vertical speed while sideways swing and taut silk continue', () => {
  for (const angle of [-0.6, 0, 0.6])
    for (const direction of [-1, 0, 1]) {
      const world = pendulumWorld(angle, 3, 2, 'reeling'),
        fighter = world.fighters[0];
      let steps = 0,
        movedSideways = false;
      while (fighter.air.mode === 'reeling' && steps++ < 150) {
        const previousY = fighter.air.y,
          previousX = fighter.x;
        stepWorld(world, [{ direction }, {}]);
        assert.ok(Math.abs(fighter.air.y - previousY - AIR.reelSpeed / 60) < 1e-9);
        assert.ok(Math.abs(fighter.air.vy - AIR.reelSpeed) < 1e-9);
        movedSideways ||= Math.abs(fighter.x - previousX) > 1e-4;
        const { origin, anchor } = silkEndpoints(fighter);
        assert.ok(
          Math.abs(
            Math.hypot(...origin.map((value, axis) => value - anchor[axis])) -
              fighter.air.ropeLength,
          ) < 1e-9,
        );
      }
      assert.ok(movedSideways);
      assert.equal(fighter.air.mode, 'reattaching');
      assert.ok(steps < 150);
    }
});

test('held A/D retrieval respects physical clearance at either edge; steering clear completes grip', () => {
  for (const index of [0, 1])
    for (const endpoint of [-1, 1])
      for (const direction of [-1, 1]) {
        const world = createWorld(),
          fighter = world.fighters[index],
          other = world.fighters[1 - index];
        fighter.x = endpoint * RULES.limit;
        other.x = fighter.x + (index ? -1 : 1) * RULES.separation;
        if (Math.abs(other.x) > RULES.limit) {
          other.x = endpoint * RULES.limit;
          fighter.x = other.x + (index ? 1 : -1) * RULES.separation;
        }
        const actions = [{}, {}];
        actions[index] = { drop: true, direction };
        stepWorld(world, actions);
        tick(world, 180);
        assert.equal(fighter.air.mode, 'grounded');
        actions[index] = { web: true, direction };
        stepWorld(world, actions);
        for (let i = 0; i < 500 && !isAttached(fighter); i++) {
          stepWorld(world, actions);
          if (fighter.air.y > -AIR.clearance)
            assert.ok(Math.abs(fighter.x - other.x) >= RULES.separation - 1e-9);
          assert.ok(
            Math.abs(fighter.x) <= RULES.limit + 1e-9 && fighter.air.y >= AIR.groundY - 1e-9,
          );
          if (['swinging', 'reeling'].includes(fighter.air.mode)) {
            const { origin, anchor } = silkEndpoints(fighter);
            assert.ok(
              Math.abs(
                Math.hypot(...origin.map((value, axis) => value - anchor[axis])) -
                  fighter.air.ropeLength,
              ) < 1e-9,
            );
          }
        }
        // An occupied landing can block ascent. Steer toward the open interior
        // instead of requiring the old identity-based no-crossing corridor.
        for (let i = 0; i < 500 && !isAttached(fighter); i++) {
          actions[index] = { direction: -endpoint };
          stepWorld(world, actions);
        }
        assert.ok(isAttached(fighter));
      }
});

test('climbing into the opponent holds below them, explains steering, and resumes after clearing', () => {
  const world = createWorld(),
    player = world.fighters[0],
    other = world.fighters[1];
  other.x = 0;
  player.x = 0;
  const offset = outletOffset(player),
    anchorY = stickSurfaceY(0, offset[2]);
  Object.assign(player.air, {
    mode: 'reeling',
    y: -2,
    vx: 0,
    vy: 0,
    ticks: 0,
    anchorX: 0,
    anchorY,
    anchorZ: offset[2],
    ropeLength: Math.hypot(player.x + offset[0], -2 + offset[1] - anchorY),
    landingX: 0,
    reelRamp: 1,
  });
  let blockedAt = -1,
    cleared = false;
  for (let i = 0; i < 300 && !isAttached(player); i++) {
    const direction = blockedAt >= 0 && i > blockedAt + 2 ? -1 : 0;
    stepWorld(world, [{ direction }, {}]);
    if (player.air.blocked && blockedAt < 0) {
      blockedAt = i;
      assert.match(fightFeedback({ world, ready: true, paused: false }).prompt, /Steer A/);
      assert.equal(fightFeedback({ world, ready: true, paused: false }).movementDisabled, false);
    }
    if (blockedAt >= 0 && player.air.y > -AIR.clearance + 0.05) cleared = true;
  }
  assert.ok(blockedAt >= 0 && cleared);
  assert.ok(isAttached(player));
  assert.ok(Math.abs(player.x) <= RULES.limit + 1e-9);
});
