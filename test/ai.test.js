import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_RULES, createAI, decideAI } from '../src/ai.js';
import { COMBAT, createWorld, stepWorld } from '../src/combat.js';
import { RULES } from '../src/movement.js';

const neutral = { direction: 0, bite: false, dash: false };
function inRange(world) {
  world.fighters[1].x = world.fighters[0].x + RULES.separation + COMBAT.reach / 2;
  return world;
}

test('AI waits one second initially and reset restores that grace period', () => {
  const world = inRange(createWorld());
  const ai = createAI();
  for (world.tick = 0; world.tick < AI_RULES.initialWait; world.tick++) {
    assert.deepEqual(decideAI(ai, world), neutral);
  }
  assert.equal(decideAI(ai, world).bite, true);
  assert.deepEqual(createAI(), { state: 'opening_wait', readyAt: 60 });
});

test('AI approaches into clear-gap range without dashing or mutating the world', () => {
  const world = createWorld();
  world.tick = AI_RULES.initialWait;
  const before = structuredClone(world);
  assert.deepEqual(decideAI(createAI(), world), { direction: -1, bite: false, dash: false });
  assert.deepEqual(world, before);
  world.fighters[1].x = world.fighters[0].x + RULES.separation + COMBAT.reach + 0.01;
  assert.equal(decideAI(createAI(), world).bite, false);
  inRange(world);
  assert.deepEqual(decideAI(createAI(), world), { direction: 0, bite: true, dash: false });
});

test('AI cannot act through attack, hitstun, dash, KO, or ended rounds', () => {
  for (const phase of ['windup', 'active', 'recovery', 'hitstun', 'ko']) {
    const world = inRange(createWorld());
    world.tick = 120;
    world.fighters[1].phase = phase;
    assert.deepEqual(decideAI(createAI(), world), neutral);
  }
  const world = inRange(createWorld());
  world.tick = 120;
  world.fighters[1].dashRemaining = 0.1;
  assert.deepEqual(decideAI(createAI(), world), neutral);
  world.fighters[1].dashRemaining = 0;
  world.status = 'ended';
  assert.deepEqual(decideAI(createAI(), world), neutral);
});

test('AI leaves a full decision delay after recovery or interruption', () => {
  for (const phase of ['recovery', 'hitstun']) {
    const world = inRange(createWorld());
    const ai = createAI();
    world.tick = 120;
    world.fighters[1].phase = phase;
    decideAI(ai, world);
    world.fighters[1].phase = 'idle';
    world.tick++;
    const readyAt = world.tick + AI_RULES.decisionDelay;
    for (; world.tick < readyAt; world.tick++) assert.deepEqual(decideAI(ai, world), neutral);
    assert.equal(decideAI(ai, world).bite, true);
  }
});

test('AI attack commitment is not cancelled when the player retreats', () => {
  const world = inRange(createWorld());
  const ai = createAI();
  world.tick = 60;
  stepWorld(world, [neutral, decideAI(ai, world)]);
  assert.equal(world.fighters[1].phase, 'windup');
  world.fighters[0].x = -RULES.limit;
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(decideAI(ai, world), neutral);
    stepWorld(world, [neutral, neutral]);
    assert.equal(world.fighters[1].phase, 'windup');
  }
  for (let i = 0; i < COMBAT.windup + COMBAT.active + COMBAT.recovery; i++) {
    stepWorld(world, [neutral, decideAI(ai, world)]);
  }
  assert.equal(world.fighters[0].hp, COMBAT.maxHealth);
  assert.equal(world.fighters[1].attackHit, false);
});

test('a player reacting to visible windup can evade and punish a full AI round', () => {
  const world = createWorld();
  const ai = createAI();
  let observedWindups = 0;
  for (let tick = 0; tick < 3600 && world.status === 'playing'; tick++) {
    const [player, opponent] = world.fighters;
    let action = { direction: 0 };
    if (['windup', 'active'].includes(opponent.phase)) {
      action.direction = -1;
      if (opponent.phase === 'windup' && opponent.phaseTicks === 1) observedWindups++;
    } else if (['recovery', 'hitstun'].includes(opponent.phase)) {
      const gap = opponent.x - player.x - RULES.separation;
      action = { direction: gap > COMBAT.reach / 2 ? 1 : 0, bite: player.phase === 'idle' && gap <= COMBAT.reach / 2 };
    }
    stepWorld(world, [action, world.hitstop ? neutral : decideAI(ai, world)]);
  }
  assert.ok(observedWindups > 0);
  assert.equal(world.winner, 'player');
  assert.equal(world.fighters[0].hp, COMBAT.maxHealth);
});


test('every detached mode holds both sides and restarts full grace on return', () => {
  for (const index of [0, 1]) {
    for (const mode of ['falling', 'grounded', 'deploying', 'swinging', 'reeling', 'reattaching']) {
      const world = inRange(createWorld()), ai = createAI();
      world.tick = 120;
      world.fighters[index].air.mode = mode;
      assert.deepEqual(decideAI(ai, world), neutral, `${index}: ${mode}`);
      assert.equal(ai.state, 'aerial_hold');
      world.tick = 600;
      assert.deepEqual(decideAI(ai, world), neutral);
      world.fighters[index].air.mode = 'attached';
      world.tick++;
      const readyAt = world.tick + AI_RULES.decisionDelay;
      for (; world.tick < readyAt; world.tick++) {
        assert.deepEqual(decideAI(ai, world), neutral);
        assert.equal(ai.state, 'return_grace');
      }
      assert.equal(decideAI(ai, world).bite, true);
    }
  }
});

test('another aerial interruption restarts grace before movement as well as bites', () => {
  const world = createWorld(), ai = createAI();
  world.tick = 120;
  world.fighters[0].air.mode = 'falling';
  decideAI(ai, world);
  world.tick = 300;
  world.fighters[0].air.mode = 'attached';
  assert.deepEqual(decideAI(ai, world), neutral);
  world.tick = 320;
  world.fighters[0].air.mode = 'falling';
  decideAI(ai, world);
  world.tick = 321;
  world.fighters[0].air.mode = 'attached';
  for (; world.tick < 351; world.tick++) assert.deepEqual(decideAI(ai, world), neutral);
  assert.deepEqual(decideAI(ai, world), { direction: -1, bite: false, dash: false });
  assert.equal(ai.state, 'approach');
});

test('deterministic geometry threshold ignores private inputs and never changes world state', () => {
  for (const offset of [-1e-8, 1e-8]) {
    const world = createWorld();
    world.tick = AI_RULES.initialWait;
    world.fighters[1].x = world.fighters[0].x + RULES.separation + COMBAT.reach - AI_RULES.rangeMargin + offset;
    const before = structuredClone(world);
    Object.defineProperty(world, 'inputs', { get() { throw new Error('AI inspected player inputs'); } });
    const first = createAI(), second = createAI();
    const action = decideAI(first, world);
    assert.deepEqual(action, decideAI(second, world));
    assert.deepEqual(first, second);
    assert.deepEqual(structuredClone(world), before);
    assert.deepEqual(action, { direction: offset > 0 ? -1 : 0, bite: offset < 0, dash: false });
  }
});
