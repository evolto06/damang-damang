import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, COMBAT } from '../src/combat.js';
import { AIR, isAttached } from '../src/aerial.js';
import { RULES } from '../src/movement.js';
import { getStage, sameStick } from '../src/stage.js';
import { createAI, decideAI } from '../src/ai.js';

test('pavement impact hurts once, lingering hurts each second, and silk still recovers', () => {
  const world = createWorld(),
    fighter = world.fighters[0];
  stepWorld(world, [{ drop: true }, {}]);
  for (let t = 0; t < 180 && fighter.air.mode !== 'grounded'; t++) stepWorld(world);
  assert.equal(fighter.hp, 90);
  for (let t = 0; t < 59; t++) stepWorld(world);
  assert.equal(fighter.hp, 90);
  stepWorld(world);
  assert.equal(fighter.hp, 85);
  for (let t = 0; t < 500 && !isAttached(fighter); t++) stepWorld(world, [{ web: t === 0 }, {}]);
  assert.ok(isAttached(fighter));
  assert.ok(fighter.hp > 0);
});

test('simultaneous lethal pavement impacts draw and freeze through the normal result flow', () => {
  const world = createWorld();
  for (const fighter of world.fighters) {
    fighter.hp = 10;
    Object.assign(fighter.air, {
      mode: 'falling',
      y: AIR.groundY + 0.001,
      vy: -1,
    });
  }
  stepWorld(world);
  assert.equal(world.status, 'ended');
  assert.equal(world.winner, 'draw');
  assert.ok(world.events.every((event) => event.type === 'groundhit'));
  const ended = structuredClone(world);
  stepWorld(world);
  assert.deepEqual(world, ended);
});

test('a lunge telegraphs startup, strikes once, knocks off, and commits to recovery on a miss', () => {
  const world = createWorld(),
    [player, target] = world.fighters;
  player.x = 0;
  target.x = RULES.separation + 0.5;
  stepWorld(world, [{ dash: true }, {}]);
  assert.equal(player.phase, 'lungewindup');
  assert.equal(player.x, 0);
  let hits = 0;
  for (let t = 0; t < 120; t++) {
    stepWorld(world);
    hits += world.events.filter((event) => event.type === 'hit').length;
  }
  assert.equal(hits, 1);
  assert.equal(target.hp, 100 - COMBAT.lungeDamage - COMBAT.groundDamage);
  assert.ok(!isAttached(target));
  const miss = createWorld();
  stepWorld(miss, [{ dash: true, direction: -1 }, {}]);
  const seen = new Set();
  for (let t = 0; t < 60; t++) {
    seen.add(miss.fighters[0].phase);
    stepWorld(miss);
  }
  assert.ok(seen.has('lungeactive') && seen.has('lungerecovery'));
  assert.equal(miss.fighters[1].hp, 100);
});

test('raised arena has distinct heights, silk reaches both levels and the bot can cross either way', () => {
  const stage = getStage('terraces');
  assert.equal(stage.id, 'terraces');
  assert.ok(stage.sticks[1].y > stage.sticks[0].y);
  for (const side of [-1, 1]) {
    const world = createWorld('terraces'),
      ai = createAI();
    const [player, bot] = world.fighters;
    player.x = side * 5;
    bot.x = -side * 5;
    player.air.y = stage.sticks[side > 0 ? 1 : 0].y;
    bot.air.y = stage.sticks[side > 0 ? 0 : 1].y;
    let crossed = false;
    for (let t = 0; t < 1600 && world.status === 'playing'; t++) {
      stepWorld(world, [{}, decideAI(ai, world)]);
      assert.ok(Number.isFinite(bot.x + bot.air.y));
      if (isAttached(bot) && sameStick(bot.x, player.x, stage)) {
        crossed = true;
        break;
      }
    }
    assert.ok(crossed, `bot crosses toward ${side}`);
    assert.equal(bot.air.y, player.air.y);
  }
});

test('seeded bots mix telegraphed ranged pressure into approach without reading inputs', () => {
  let shots = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const world = createWorld(),
      ai = createAI(seed);
    world.tick = 120;
    world.fighters[0].x = 0;
    world.fighters[1].x = RULES.separation + 1.3;
    const before = structuredClone(world);
    for (let tick = 0; tick < 100; tick++) {
      world.tick++;
      if (decideAI(ai, world).shoot) {
        shots++;
        break;
      }
    }
    assert.deepEqual(world.fighters, before.fighters);
  }
  assert.ok(shots > 0);
});

test('a low silk anchor cannot snap a spider onto a higher rail during the final grip', () => {
  const world = createWorld('terraces'),
    fighter = world.fighters[0];
  fighter.x = 1;
  Object.assign(fighter.air, {
    mode: 'reeling',
    y: -0.25,
    targetY: 0,
    anchorX: -1.2,
    anchorY: -0.07,
    landingX: 1,
  });
  stepWorld(world);
  assert.equal(fighter.air.mode, 'reeling');
  assert.equal(fighter.air.blocked, true);
  assert.equal(fighter.air.clearDirection, -1);
  for (let t = 0; t < 500 && !isAttached(fighter); t++) {
    const before = fighter.x;
    stepWorld(world, [{ direction: -1 }, {}]);
    assert.ok(Math.abs(fighter.x - before) < 0.12);
  }
  assert.ok(isAttached(fighter));
  assert.equal(fighter.air.y, 0);
  assert.ok(fighter.x <= -0.75);
});
