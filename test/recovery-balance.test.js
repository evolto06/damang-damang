import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, COMBAT } from '../src/combat.js';
import { AIR, isAttached } from '../src/aerial.js';
import { RULES } from '../src/movement.js';
import { stickAt } from '../src/stage.js';
import { fightFeedback, hintsFor } from '../src/feedback.js';

test('either attached fighter can reposition and lunge during the other fighter swing, without leaving its twig', () => {
  for (const stage of ['single', 'twin', 'terraces'])
    for (const index of [0, 1]) {
      const world = createWorld(stage),
        fighter = world.fighters[index],
        other = world.fighters[1 - index];
      Object.assign(other.air, {
        mode: 'swinging',
        y: -2,
        ticks: 15,
        anchorX: other.x,
        anchorY: 0,
        ropeLength: 1.9,
        landingX: other.x,
      });
      const before = fighter.x,
        direction = index ? 1 : -1;
      for (let t = 0; t < 6; t++) {
        const actions = [{}, {}];
        actions[index] = { direction };
        stepWorld(world, actions);
      }
      assert.ok(
        (fighter.x - before) * direction > 0.05,
        `${stage} P${index + 1} can move while silk is deployed`,
      );
      const actions = [{}, {}];
      actions[index] = { dash: true, direction };
      stepWorld(world, actions);
      assert.equal(fighter.phase, 'lungewindup');
      const [low, high] = stickAt(before, world.stage);
      for (let t = 0; t < 100; t++) {
        other.air.mode = 'grounded';
        other.air.y = AIR.groundY;
        other.hp = 100;
        stepWorld(world, actions);
        assert.ok(fighter.x >= low && fighter.x <= high);
      }
      assert.equal(fighter.hp, 100);
    }
});

test('returning-opponent feedback enables movement, lunge and drop but explains attacks cannot hit airborne targets', () => {
  const world = createWorld();
  world.fighters[1].air.mode = 'swinging';
  const feedback = fightFeedback({
    world,
    ready: true,
    paused: false,
    mode: 'bot',
  });
  assert.equal(feedback.movementDisabled, false);
  assert.equal(feedback.actions.dash.disabled, false);
  assert.equal(feedback.actions.drop.disabled, false);
  assert.equal(feedback.actions.bite.disabled, true);
  assert.equal(feedback.actions.shoot.disabled, true);
  assert.equal(feedback.phases[0], 'Ready');
  assert.equal(hintsFor(world)[0]?.action, 'move');
});

test('at close range a simultaneous normal bite interrupts a lunge in either heading', () => {
  for (const biting of [0, 1]) {
    const world = createWorld();
    world.fighters[0].x = 0;
    world.fighters[1].x = RULES.separation + COMBAT.reach / 2;
    const actions = [{ dash: true }, { dash: true }];
    actions[biting] = { bite: true };
    stepWorld(world, actions);
    for (let t = 0; t < 40 && !world.events.some((e) => e.type === 'hit'); t++) stepWorld(world);
    assert.equal(world.fighters[biting].hp, 100, 'quick bite wins the close-range contest');
    assert.equal(world.fighters[1 - biting].hp, 100 - COMBAT.damage);
  }
});

test('a missed lunge is exposed long enough for a normal bite to punish it', () => {
  const world = createWorld(),
    [lunger, biter] = world.fighters;
  stepWorld(world, [{ dash: true, direction: -1 }, {}]);
  for (let t = 0; t < 100 && lunger.phase !== 'lungerecovery'; t++) stepWorld(world);
  lunger.x = 0;
  biter.x = RULES.separation + COMBAT.reach / 2;
  stepWorld(world, [{}, { bite: true }]);
  for (let t = 0; t < 30 && lunger.hp === 100; t++) stepWorld(world);
  assert.equal(lunger.hp, 80);
  assert.equal(biter.hp, 100);
  assert.ok(COMBAT.lungerecovery > COMBAT.windup + 3);
});
