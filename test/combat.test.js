import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT, createWorld, stepWorld, clearGap } from '../src/combat.js';
import { RULES } from '../src/movement.js';

const tick = (world, count, actions = [{}, {}]) => {
  for (let i = 0; i < count; i++) stepWorld(world, actions);
};
function closeWorld(gap = 0) {
  const world = createWorld();
  world.fighters[0].x = 0;
  world.fighters[1].x = RULES.separation + gap;
  return world;
}

test('a whiff completes 18 windup, 6 active, and 21 recovery ticks exactly', () => {
  const world = createWorld(),
    fighter = world.fighters[0];
  stepWorld(world, [{ bite: true }, {}]);
  tick(world, 17);
  assert.equal(fighter.phase, 'windup');
  assert.equal(fighter.phaseTicks, 18);
  stepWorld(world);
  assert.equal(fighter.phase, 'active');
  assert.equal(fighter.phaseTicks, 1);
  tick(world, 5);
  assert.equal(fighter.phase, 'active');
  assert.equal(fighter.phaseTicks, 6);
  stepWorld(world);
  assert.equal(fighter.phase, 'recovery');
  tick(world, 20);
  assert.equal(fighter.phaseTicks, 21);
  stepWorld(world);
  assert.equal(fighter.phase, 'idle');
  assert.deepEqual(
    world.fighters.map((f) => f.hp),
    [100, 100],
  );
});
test('contact, reach boundary, and floating tolerance are deliberate; just outside misses', () => {
  for (const [gap, damage] of [
    [0, 20],
    [COMBAT.reach - 1e-8, 20],
    [COMBAT.reach, 20],
    [COMBAT.reach + 1e-6, 0],
  ]) {
    const world = closeWorld(gap);
    stepWorld(world, [{ bite: true }, {}]);
    tick(world, 17);
    assert.equal(world.fighters[1].hp, 100);
    tick(world, 7);
    assert.equal(world.fighters[1].hp, 100 - damage, `gap ${gap}`);
    assert.equal(world.fighters[0].attackId, 1);
  }
});
test('one bite hits once, and a missed first active tick can connect later', () => {
  const world = closeWorld(COMBAT.reach + 0.005);
  stepWorld(world, [{ bite: true }, {}]);
  tick(world, 18);
  assert.equal(world.fighters[1].hp, 100);
  tick(world, 5, [{}, { direction: -1 }]);
  assert.equal(world.fighters[1].hp, 80);
  tick(world, 30);
  assert.equal(world.fighters[1].hp, 80);
});
test('bite wins simultaneous dash input and locks movement through recovery', () => {
  const world = closeWorld(1),
    x = world.fighters[0].x;
  stepWorld(world, [{ direction: 1, bite: true, dash: true }, {}]);
  tick(world, 44, [{ direction: 1, dash: true, bite: true }, {}]);
  assert.equal(world.fighters[0].x, x);
  assert.equal(world.fighters[0].attackId, 1);
  assert.equal(world.fighters[0].cooldown, 0);
});
test('a hit cancels a later windup and provides exactly 11 stunned ticks', () => {
  const world = closeWorld();
  stepWorld(world, [{ bite: true }, {}]);
  tick(world, 2);
  stepWorld(world, [{}, { bite: true }]);
  tick(world, 17);
  assert.deepEqual(
    world.fighters.map((f) => f.hp),
    [100, 80],
  );
  assert.equal(world.fighters[1].phase, 'hitstun');
  tick(world, COMBAT.hitstop);
  assert.equal(world.fighters[1].phaseTicks, 1);
  tick(world, 10);
  assert.equal(world.fighters[1].phase, 'hitstun');
  assert.equal(world.fighters[1].phaseTicks, 11);
  stepWorld(world);
  assert.equal(world.fighters[1].phase, 'idle');
  assert.equal(world.fighters[0].hp, 100);
});
test('same-tick bites trade without ordering bias and knock both fighters apart', () => {
  const world = closeWorld(),
    gap = clearGap(world);
  stepWorld(world, [{ bite: true }, { bite: true }]);
  tick(world, 20);
  assert.equal(world.events.length, 2);
  assert.deepEqual(
    world.fighters.map((f) => f.hp),
    [80, 80],
  );
  assert.equal(clearGap(world), gap);
  const contact = world.fighters.map((f) => ({ x: f.x, pose: { ...f.pose } }));
  tick(world, COMBAT.hitstop - 1);
  assert.deepEqual(
    world.fighters.map((f) => ({ x: f.x, pose: f.pose })),
    contact,
  );
  stepWorld(world);
  assert.ok(Math.abs(clearGap(world) - gap - COMBAT.knockback * 2) < 1e-9);
});
test('either edge clamps knockback without crossing or pushing past the stick', () => {
  for (const target of [0, 1]) {
    const world = closeWorld();
    if (target === 0) {
      world.fighters[0].x = -RULES.limit;
      world.fighters[1].x = -RULES.limit + RULES.separation;
    } else {
      world.fighters[1].x = RULES.limit;
      world.fighters[0].x = RULES.limit - RULES.separation;
    }
    const actions = [{}, {}];
    actions[1 - target] = { bite: true };
    stepWorld(world, actions);
    tick(world, 20 + COMBAT.hitstop);
    assert.equal(world.fighters[target].x, target ? RULES.limit : -RULES.limit);
    assert.equal(world.fighters[target].hp, 80);
    assert.ok(clearGap(world) >= 0);
  }
});
test('player win, opponent win, and simultaneous lethal draw freeze the round once', () => {
  for (const winner of ['player', 'opponent', 'draw']) {
    const world = closeWorld();
    world.fighters.forEach((f, i) => {
      f.hp = winner === 'draw' || (winner === 'player' ? i === 1 : i === 0) ? 10 : 100;
    });
    stepWorld(world, [{ bite: winner !== 'opponent' }, { bite: winner !== 'player' }]);
    tick(world, 20);
    assert.equal(world.status, 'ended');
    assert.equal(world.winner, winner);
    const ended = structuredClone(world);
    tick(world, 60, [
      { bite: true, dash: true, direction: 1 },
      { bite: true, direction: -1 },
    ]);
    assert.deepEqual(world, ended);
    assert.ok(world.fighters.every((f) => f.hp >= 0));
  }
});
test('dash has no damage or invulnerability: an active bite can hit a dashing fighter', () => {
  const world = closeWorld(0.08);
  stepWorld(world, [{ bite: true }, {}]);
  tick(world, 19);
  stepWorld(world, [{}, { dash: true, direction: -1 }]);
  assert.equal(world.fighters[1].hp, 80);
  assert.equal(world.fighters[1].dashRemaining, 0);
  assert.equal(world.fighters[0].hp, 100);
});
