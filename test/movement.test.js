import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, COMBAT } from '../src/combat.js';
import { RULES } from '../src/movement.js';

const tick = (world, count, actions) => {
  for (let i = 0; i < count; i++) stepWorld(world, actions);
};
function legal(world) {
  const [left, right] = world.fighters;
  assert.ok(left.x >= -RULES.limit && right.x <= RULES.limit);
  if (world.fighters.every((f) => f.air.mode === 'attached'))
    assert.ok(right.x - left.x >= RULES.separation - 1e-9);
}
test('both fighters accelerate and brake, with mirrored movement', () => {
  const world = createWorld();
  tick(world, 15, [{ direction: 1 }, { direction: -1 }]);
  assert.ok(world.fighters[0].x > RULES.startX);
  assert.ok(Math.abs(world.fighters[0].x + world.fighters[1].x) < 1e-9);
  tick(world, 20, [{}, {}]);
  assert.equal(world.fighters[0].velocity, 0);
  assert.equal(world.fighters[1].velocity, 0);
});
test('simultaneous inward movement and opposing dashes remain symmetric without crossing', () => {
  const world = createWorld();
  for (let i = 0; i < 5000; i++) {
    stepWorld(world, [
      { direction: 1, dash: i % 60 === 0 },
      { direction: -1, dash: i % 60 === 0 },
    ]);
    legal(world);
    assert.ok(Math.abs(world.fighters[0].x + world.fighters[1].x) < 1e-8);
  }
});
test('ordinary movement cannot push a stationary opponent', () => {
  const world = createWorld();
  tick(world, 600, [{ direction: 1 }, {}]);
  assert.equal(world.fighters[1].x, RULES.opponentX);
  assert.ok(Math.abs(world.fighters[1].x - world.fighters[0].x - RULES.separation) < 1e-9);
});
test('outward movement clamps both ends and an idle dash faces inward', () => {
  const world = createWorld();
  tick(world, 600, [{ direction: -1 }, { direction: 1 }]);
  assert.equal(world.fighters[0].x, -RULES.limit);
  assert.equal(world.fighters[1].x, RULES.limit);
  stepWorld(world, [{ dash: true }, { dash: true }]);
  tick(world, COMBAT.lungewindup);
  assert.ok(world.fighters[0].x > -RULES.limit && world.fighters[1].x < RULES.limit);
  legal(world);
});
test('dash cooldown rejects rapid retries and becomes available again', () => {
  const world = createWorld();
  stepWorld(world, [{ dash: true, direction: -1 }, {}]);
  tick(world, 20, [{ dash: true, direction: -1 }, {}]);
  assert.ok(world.fighters[0].cooldown < RULES.dashCooldown - 0.2);
  tick(world, 50, [{}, {}]);
  assert.equal(world.fighters[0].cooldown, 0);
  stepWorld(world, [{ dash: true }, {}]);
  assert.equal(world.fighters[0].phase, 'lungewindup');
  tick(world, COMBAT.lungewindup);
  assert.ok(world.fighters[0].dashRemaining > 0);
});
