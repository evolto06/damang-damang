import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STAGES, getStage, stickFor, sameStick, twigAbove } from '../src/stage.js';
import { AIR, isAttached, releaseStick, silkEndpoints, stickSurfaceY } from '../src/aerial.js';
import { createWorld, stepWorld, COMBAT } from '../src/combat.js';
import { createAI, decideAI } from '../src/ai.js';
import { RULES, resolveContact } from '../src/movement.js';
import { createRuntime, setReady, frameRuntime, pauseRuntime } from '../src/runtime.js';
import { createHeldStick } from '../src/scene.js';
import { fitPlayCamera, followCameraFocus } from '../src/camera.js';

const advance = (world, ticks, actions) => { for (let tick = 0; tick < ticks; tick++) stepWorld(world, actions); };
function position(fighter, x, stage) {
  fighter.x = x; fighter.air.y = stickFor(x, stage).y;
}

test('height arena keeps attached fighters, twigs and both supports at their actual heights', () => {
  const world = createWorld('heights');
  assert.equal(world.stage, STAGES.heights);
  assert.deepEqual(world.fighters.map(fighter => fighter.air.y), [-0.9, 0.9]);
  const root = createHeldStick(new THREE.Scene(), 'heights');
  const twigs = root.children.filter(node => node.name === 'Twig');
  assert.deepEqual(twigs.map(twig => twig.position.y), [-0.9, 0.9]);
  assert.equal(root.children.find(node => node.name === 'Holder').position.y, 0.9);
  assert.equal(root.children.find(node => node.name === 'Left holder').position.y, -0.9);
  for (const fighter of world.fighters) {
    const y = fighter.air.y; releaseStick(fighter);
    assert.equal(fighter.air.y, y);
    assert.ok(Math.abs(fighter.air.anchorY - y - stickSurfaceY(fighter.air.anchorX, fighter.air.anchorZ, { sticks: [stickFor(fighter.x, world.stage)] })) < 1e-9);
  }
});

test('casts select a real overhead twig and ignore any twig below the spider in overlapping layouts', () => {
  const overlap = { id: 'overlap', start: [-2, 2], sticks: [
    { walk: [-4, 4], body: [-5, 5], y: -1 },
    { walk: [-4, 4], body: [-5, 5], y: 1 },
  ] };
  assert.equal(getStage(overlap), overlap);
  assert.equal(twigAbove(0, 0, overlap), overlap.sticks[1]);
  assert.equal(twigAbove(0, -2, overlap), overlap.sticks[0]);
  assert.equal(twigAbove(0, 2, overlap), null);
  assert.equal(twigAbove(2, -3, STAGES.heights), STAGES.heights.sticks[1]);
  const world = createWorld(overlap), fighter = world.fighters[0];
  fighter.air.mode = 'falling'; fighter.air.y = 0;
  stepWorld(world, [{ web: true }, {}]);
  assert.equal(fighter.air.targetY, 1);
  const endpoints = silkEndpoints(fighter);
  assert.ok(endpoints.anchor[1] > endpoints.origin[1]);
  assert.ok(endpoints.anchor[1] > 0.9);
});

test('attached fighters on overlapping sticks at different heights never collide or bite', () => {
  const layout = { id: 'overlap', start: [-1, 1], sticks: [
    { walk: [-4, 4], body: [-5, 5], y: -0.9 },
    { walk: [-4, 4], body: [-5, 5], y: 0.9 },
  ] };
  const world = createWorld(layout), [a, b] = world.fighters;
  a.x = -RULES.separation / 2; a.air.y = -0.9;
  b.x = RULES.separation / 2; b.air.y = 0.9;
  assert.equal(sameStick(a, b, layout), false);
  advance(world, 60, [{ bite: true }, { bite: true }]);
  assert.deepEqual(world.fighters.map(fighter => fighter.hp), [100, 100]);
  a.x = b.x = 0; resolveContact(world.fighters, [-0.1, 0.1], layout);
  assert.equal(a.x, 0); assert.equal(b.x, 0);
});

test('height crossing sweep returns to the selected twig in both directions without teleporting the final grip', () => {
  let changedHeight = 0;
  for (const direction of [-1, 1]) for (const start of [0.75, 1.2, 2.0]) for (const castAt of [35, 50, 65]) {
    const world = createWorld('heights'), [fighter, other] = world.fighters;
    position(fighter, -direction * start, world.stage); position(other, direction * 10, world.stage);
    const initialY = fighter.air.y;
    stepWorld(world, [{ drop: true, direction }, {}]);
    let steer = direction, lastY = fighter.air.y, lastMode = fighter.air.mode;
    for (let tick = 0; tick < 700 && !isAttached(fighter); tick++) {
      if (fighter.air.blocked) steer = fighter.air.clearDirection || -direction;
      stepWorld(world, [{ direction: steer, web: tick === castAt }, {}]);
      assert.ok(Number.isFinite(fighter.x + fighter.air.y));
      assert.ok(fighter.air.y >= AIR.groundY - 1e-9);
      if (lastMode === 'reattaching') assert.ok(Math.abs(fighter.air.y - lastY) < 0.05);
      lastY = fighter.air.y; lastMode = fighter.air.mode;
    }
    assert.equal(fighter.air.mode, 'attached', JSON.stringify({ direction, start, castAt }));
    assert.equal(fighter.air.y, stickFor(fighter, world.stage).y);
    const [low, high] = stickFor(fighter, world.stage).walk;
    assert.ok(fighter.x >= low && fighter.x <= high);
    if (fighter.air.y !== initialY) changedHeight++;
  }
  assert.ok(changedHeight >= 6, `only ${changedHeight} crossings changed height`);
});

test('bot routes to both higher and lower rails, retrieves, and resumes combat', () => {
  for (const direction of [-1, 1]) for (const playerX of [3, 8, 12]) {
    const world = createWorld('heights'), ai = createAI();
    position(world.fighters[0], direction * playerX, world.stage);
    position(world.fighters[1], -direction * 6, world.stage);
    let detached = false;
    for (let tick = 0; tick < 1800 && world.fighters[0].hp === 100; tick++) {
      stepWorld(world, [{}, world.hitstop ? {} : decideAI(ai, world)]);
      detached ||= !isAttached(world.fighters[1]);
    }
    assert.ok(detached);
    assert.ok(world.fighters[0].hp < 100, JSON.stringify({ direction, playerX, bot: world.fighters[1] }));
    assert.equal(sameStick(...world.fighters, world.stage), true);
  }
});

test('height camera frames upper twigs and pavement between HUD bands on desktop and landscape phone', () => {
  for (const [width, height] of [[1366, 768], [844, 390]]) {
    const world = createWorld('heights'), focus = { x: 0, halfSpan: 4.2 };
    followCameraFocus(focus, world.fighters, world.stage);
    assert.equal(focus.topY, 0.9);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 3.5, 12); camera.lookAt(0, 0.5, 0);
    const { topBand, bottomBand } = fitPlayCamera(camera, width, height, focus);
    const top = new THREE.Vector3(6, AIR.stickY + 1.1, 0).project(camera);
    const floor = new THREE.Vector3(0, -2.55, 0).project(camera);
    assert.ok((1 - top.y) * height / 2 >= topBand - 1e-8);
    assert.ok((1 - floor.y) * height / 2 <= height - bottomBand + 1e-8);
  }
});

function groundedWorld(health = [100, 100]) {
  const world = createWorld();
  world.fighters.forEach((fighter, index) => {
    fighter.air.mode = 'grounded'; fighter.air.y = AIR.groundY; fighter.hp = health[index];
  });
  return world;
}
test('pavement damage gives full grace, ticks once per interval for both fighters, and stops after retrieval lifts', () => {
  const world = groundedWorld();
  advance(world, COMBAT.groundGraceTicks + COMBAT.groundIntervalTicks - 1);
  assert.deepEqual(world.fighters.map(fighter => fighter.hp), [100, 100]);
  stepWorld(world);
  assert.deepEqual(world.fighters.map(fighter => fighter.hp), [95, 95]);
  assert.deepEqual(world.events, [0, 1].map(target => ({ type: 'groundhit', target, damage: 5 })));
  assert.equal(world.hitstop, 0);
  advance(world, COMBAT.groundIntervalTicks);
  assert.deepEqual(world.fighters.map(fighter => fighter.hp), [90, 90]);
  stepWorld(world, [{ web: true }, { web: true }]);
  for (let tick = 0; tick < 600 && world.fighters.some(fighter => !isAttached(fighter)); tick++) stepWorld(world);
  assert.ok(world.fighters.every(isAttached));
  assert.deepEqual(world.fighters.map(fighter => fighter.hp), [90, 90]);
  assert.deepEqual(world.fighters.map(fighter => fighter.groundTicks), [0, 0]);
});

test('ground defeat uses normal round results, resolves simultaneous damage as a draw, and freezes the ended state', () => {
  for (const [health, winner] of [[[5, 100], 'opponent'], [[100, 5], 'player'], [[5, 5], 'draw']]) {
    const world = groundedWorld(health);
    advance(world, COMBAT.groundGraceTicks + COMBAT.groundIntervalTicks);
    assert.equal(world.status, 'ended'); assert.equal(world.endReason, 'ko'); assert.equal(world.winner, winner);
    const ended = structuredClone(world); stepWorld(world, [{ web: true }, { web: true }]);
    assert.deepEqual(world, ended);
  }
});

test('ground cadence is identical at 30/60/144 render Hz and consumes no exposure during pause', () => {
  const outcomes = [30, 60, 144].map(hz => {
    const runtime = createRuntime({ mode: 'pvp' }); runtime.world = groundedWorld();
    setReady(runtime, true); frameRuntime(runtime, 0);
    for (let frame = 1; frame <= hz * 4; frame++) frameRuntime(runtime, frame * 1000 / hz);
    assert.deepEqual(runtime.world.fighters.map(fighter => fighter.hp), [90, 90]);
    pauseRuntime(runtime, true); const paused = structuredClone(runtime.world);
    frameRuntime(runtime, 64000); assert.deepEqual(runtime.world, paused);
    pauseRuntime(runtime, false); frameRuntime(runtime, 64000);
    for (let frame = 1; frame <= hz; frame++) frameRuntime(runtime, 64000 + frame * 1000 / hz);
    assert.deepEqual(runtime.world.fighters.map(fighter => fighter.hp), [85, 85]);
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});

test('a cross-rail return respects an opponent on the landing rail even with silk tied to the other rail', () => {
  for (const side of [-1, 1]) {
    const world = createWorld('twin'), [fighter, other] = world.fighters;
    fighter.x = other.x = side * 2;
    Object.assign(fighter.air, { mode: 'reeling', y: -0.42, targetY: 0, anchorStick: side > 0 ? 0 : 1, anchorX: -side * 0.6, anchorY: -0.06, landingX: fighter.x, reelRamp: 1 });
    advance(world, 20);
    assert.equal(fighter.air.mode, 'reeling');
    assert.equal(fighter.air.blocked, true);
    assert.ok(fighter.air.y <= -AIR.clearance + 1e-9);
    let direction = fighter.air.clearDirection || side;
    for (let tick = 0; tick < 500 && !isAttached(fighter); tick++) {
      if (fighter.air.blocked) direction = fighter.air.clearDirection || direction;
      stepWorld(world, [{ direction }, {}]);
    }
    assert.ok(isAttached(fighter), 'steering clear still completes the return');
    assert.ok(Math.abs(fighter.x - other.x) >= RULES.separation);
  }
});

test('camera reserves the measured shared touch panels without hiding the upper twig or pavement', () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(0, 0.15, 18); camera.lookAt(0, 0.4, 0);
  const width = 844, height = 390, focus = { x: 0, halfSpan: 4.2, topY: 0.9, bottomBand: 180 };
  const bands = fitPlayCamera(camera, width, height, focus);
  assert.equal(bands.bottomBand, 180);
  const top = new THREE.Vector3(0, AIR.stickY + 1.1, 0).project(camera);
  const floor = new THREE.Vector3(0, -2.55, 0).project(camera);
  assert.ok((1 - top.y) * height / 2 >= bands.topBand - 1e-8);
  assert.ok((1 - floor.y) * height / 2 <= height - bands.bottomBand + 1e-8);
});
