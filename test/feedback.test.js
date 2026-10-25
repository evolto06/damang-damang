import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, setReady } from '../src/runtime.js';
import { fightFeedback } from '../src/feedback.js';
import { stepWorld } from '../src/combat.js';

const ready = () => {
  const runtime = createRuntime();
  setReady(runtime, true);
  return runtime;
};

test('opponent return gates bite but leaves repositioning, lunge and drop available', () => {
  const runtime = ready();
  runtime.world.fighters[1].air.mode = 'reeling';
  const feedback = fightFeedback(runtime);
  assert.match(feedback.prompt, /Opponent returning/);
  assert.equal(feedback.actions.bite.disabled, true);
  assert.equal(feedback.actions.dash.disabled, false);
  assert.equal(feedback.movementDisabled, false);
  assert.equal(feedback.actions.drop.disabled, false);
  stepWorld(runtime.world, [{ bite: true, dash: true, direction: 1 }, {}]);
  const player = runtime.world.fighters[0];
  assert.equal(player.attackId, 0);
  assert.equal(player.dashRemaining, 0);
  assert.ok(player.velocity > 0);
  stepWorld(runtime.world, [{ drop: true }, {}]);
  assert.equal(player.air.mode, 'falling');
});

test('recovery guidance distinguishes manual C return, automatic retrieval and grip', () => {
  const runtime = ready(),
    player = runtime.world.fighters[0];
  for (const mode of ['falling', 'grounded']) {
    player.air.mode = mode;
    const feedback = fightFeedback(runtime);
    assert.match(feedback.prompt, /C \/ Web/);
    assert.equal(feedback.actions.web.disabled, false);
    assert.equal(feedback.actions.bite.disabled, true);
  }
  for (const mode of ['deploying', 'swinging', 'reeling', 'reattaching']) {
    player.air.mode = mode;
    const feedback = fightFeedback(runtime);
    assert.equal(feedback.actions.web.disabled, true);
    assert.equal(feedback.movementDisabled, mode === 'reattaching');
  }
  player.air.mode = 'grounded';
  assert.equal(fightFeedback(runtime).movementDisabled, true);
  assert.match(fightFeedback(runtime).prompt, /Pavement hurts/);
});

test('loading, pause and round result take precedence over aerial and attack guidance', () => {
  const runtime = createRuntime();
  runtime.world.fighters[0].air.mode = 'falling';
  assert.match(fightFeedback(runtime).prompt, /loading/);
  runtime.paused = true;
  assert.match(fightFeedback(runtime).prompt, /Paused/);
  runtime.world.status = 'ended';
  const feedback = fightFeedback(runtime);
  assert.match(feedback.prompt, /Round over/);
  assert.deepEqual(feedback.phases, ['Round over', 'Round over']);
  assert.ok(Object.values(feedback.actions).every((action) => action.disabled));
});

test('bite recovery and cooldown explain independent action availability', () => {
  const runtime = ready(),
    player = runtime.world.fighters[0];
  player.phase = 'recovery';
  assert.match(fightFeedback(runtime).prompt, /Bite recovery/);
  assert.ok(
    ['bite', 'dash', 'drop'].every((kind) => fightFeedback(runtime).actions[kind].disabled),
  );
  player.phase = 'idle';
  player.cooldown = 0.001;
  const feedback = fightFeedback(runtime);
  assert.equal(feedback.actions.bite.disabled, false);
  assert.equal(feedback.actions.drop.disabled, false);
  assert.equal(feedback.actions.dash.disabled, true);
  player.cooldown = 0;
  assert.equal(fightFeedback(runtime).actions.dash.disabled, false);
});
