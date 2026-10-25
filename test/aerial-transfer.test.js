import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/combat.js';
import { isAttached, getSilkCastTarget } from '../src/aerial.js';
import { fightFeedback, hintsFor } from '../src/feedback.js';
import { hangingPose } from '../src/hanging-pose.js';

test('a fresh web press during a low return can cast onto a higher twig and finish there', () => {
  for (const [stage, lowerIndex, upperIndex, direction] of [
    ['heights', 0, 1, 1],
    ['terraces', 1, 2, 1],
    ['terraces', 1, 0, -1],
  ])
    for (const index of [0, 1]) {
      const world = createWorld(stage),
        fighter = world.fighters[index],
        other = world.fighters[1 - index];
      const lower = world.stage.sticks[lowerIndex],
        upper = world.stage.sticks[upperIndex];
      fighter.x = lower.walk[direction > 0 ? 1 : 0] - direction * 1.2;
      fighter.air.y = lower.y;
      other.x = direction > 0 ? upper.walk[1] - 1 : upper.walk[0] + 1;
      other.air.y = upper.y;
      const actions = (action) => (index === 0 ? [action, {}] : [{}, action]);
      for (let tick = 0; tick < 20; tick++) stepWorld(world, actions({ direction }));
      stepWorld(world, actions({ direction, drop: true }));
      let recast = false,
        sawLowAnchor = false,
        sawNewCast = false;
      for (let tick = 0; tick < 1000 && (!isAttached(fighter) || !recast); tick++) {
        const request =
          !recast &&
          getSilkCastTarget(fighter) === upper &&
          ['swinging', 'reeling'].includes(fighter.air.mode);
        if (request) recast = true;
        stepWorld(world, actions({ direction, web: tick === 25 || request }));
        sawLowAnchor ||=
          ['swinging', 'reeling'].includes(fighter.air.mode) && fighter.air.targetY === lower.y;
        sawNewCast ||=
          recast && fighter.air.mode === 'deploying' && fighter.air.targetY === upper.y;
        if (isAttached(fighter) && recast) break;
      }
      assert.ok(sawLowAnchor, `${stage} P${index + 1} started with the lower anchor`);
      assert.ok(recast, `${stage} P${index + 1} direction ${direction}: reached the higher twig`);
      assert.ok(sawNewCast, 'the fresh press fires a new visible cast during the old return');
      assert.ok(isAttached(fighter));
      assert.equal(fighter.air.y, upper.y);
      assert.ok(fighter.x >= upper.walk[0] && fighter.x <= upper.walk[1]);
    }
});

test('a height-blocked powered return offers a higher cast and preserves its upward movement', () => {
  const world = createWorld('heights'),
    [fighter, other] = world.fighters;
  fighter.x = 1.5;
  other.x = 10;
  Object.assign(fighter.air, {
    mode: 'reeling',
    y: -1,
    targetY: -0.9,
    anchorStick: 0,
    anchorX: -1,
    anchorY: -0.96,
    landingX: 1.5,
    vx: 0.5,
    vy: 2.6,
    blocked: true,
    blockReason: 'height',
    animationTicks: 60,
    retrievalTicks: 24,
  });
  const feedback = fightFeedback({ world, ready: true, paused: false, mode: 'pvp' });
  assert.equal(feedback.actions.web.disabled, false);
  assert.match(feedback.prompt, /W casts a new silk line/);
  assert.equal(hintsFor(world, 0, 'pvp')[0].verb, 'Cast higher');
  stepWorld(world, [{ web: true, direction: 1 }, {}]);
  assert.equal(fighter.air.mode, 'deploying');
  assert.equal(fighter.air.targetY, 0.9);
  assert.equal(
    hangingPose(fighter).upright,
    0,
    'recasting preserves an already inverted return pose',
  );
  for (let tick = 0; tick < 4; tick++) stepWorld(world, [{ direction: 1 }, {}]);
  assert.ok(fighter.air.y > -0.9, 'the new deployment does not retain the old release-height cap');
  for (let tick = 0; tick < 700 && !isAttached(fighter); tick++)
    stepWorld(world, [{ direction: 1 }, {}]);
  assert.ok(isAttached(fighter));
  assert.equal(fighter.air.y, 0.9);
});

test('an unavailable web press does not reset a return or freeze a fall above all twigs', () => {
  for (const mode of ['reeling', 'falling']) {
    const world = createWorld('heights'),
      fighter = world.fighters[1];
    Object.assign(fighter.air, {
      mode,
      y: mode === 'falling' ? 3 : -1,
      targetY: 0.9,
      anchorStick: 1,
      anchorX: fighter.x,
      anchorY: 0.84,
      landingX: fighter.x,
      vx: 1,
      vy: 2.6,
    });
    const neutral = structuredClone(world);
    assert.equal(getSilkCastTarget(fighter), null);
    stepWorld(world, [{}, { web: true, direction: 1 }]);
    stepWorld(neutral, [{}, { direction: 1 }]);
    assert.deepEqual(fighter.air, neutral.fighters[1].air);
    assert.equal(fighter.x, neutral.fighters[1].x);
  }
});
