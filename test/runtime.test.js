import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, setReady, frameRuntime, queueAction, queueDirection, pauseRuntime, restartRuntime, createClock, runClock } from '../src/runtime.js';

const ready = options => { const runtime = createRuntime(options); setReady(runtime, true); frameRuntime(runtime, 0); return runtime; };

test('render interpolation samples the previous tick and exposes the fraction elapsed', () => {
  const runtime = ready();
  const startX = runtime.world.fighters[0].x;
  queueDirection(runtime, 0, -1, 0);
  frameRuntime(runtime, 1000 / 60);
  assert.equal(runtime.world.previous[0].x, startX);
  assert.ok(runtime.world.fighters[0].x < startX);
  assert.ok(runtime.alpha >= 0 && runtime.alpha < 1);
  frameRuntime(runtime, 1000 / 60 + 1000 / 120);
  assert.ok(Math.abs(runtime.alpha - 0.5) < 1e-9);
  pauseRuntime(runtime, true); frameRuntime(runtime, 5000);
  assert.equal(runtime.alpha, 1);
  pauseRuntime(runtime, false); frameRuntime(runtime, 6000);
  assert.equal(runtime.alpha, 1);
});
test('unready simulation and inputs are gated, including a failed or delayed asset load', () => {
  let decisions = 0;
  const runtime = createRuntime({ decideOpponent: () => { decisions++; return { bite: true }; } });
  assert.equal(queueAction(runtime, 0, 'bite', 5), false);
  queueDirection(runtime, 0, 1, 5);
  frameRuntime(runtime, 0); frameRuntime(runtime, 5000);
  assert.equal(runtime.world.tick, 0); assert.equal(decisions, 0);
  setReady(runtime, true); frameRuntime(runtime, 6000); frameRuntime(runtime, 6000 + 1000 / 60);
  assert.equal(runtime.world.tick, 1); assert.equal(runtime.world.fighters[0].attackId, 0);
});
test('first/no-tick frames retain an edge until the first eligible tick and consume it once', () => {
  const runtime = ready();
  queueAction(runtime, 0, 'bite', 5);
  frameRuntime(runtime, 7); frameRuntime(runtime, 12);
  assert.equal(runtime.world.tick, 0); assert.equal(runtime.controls[0].inputs.length, 1);
  frameRuntime(runtime, 17); assert.equal(runtime.world.fighters[0].attackId, 1);
  frameRuntime(runtime, 1000); assert.equal(runtime.world.fighters[0].attackId, 1);
  assert.equal(runtime.controls[0].inputs.length, 0);
});
test('a busy action is rejected on its eligible tick instead of starting after recovery', () => {
  const runtime = ready();
  queueAction(runtime, 0, 'bite', 1); frameRuntime(runtime, 17);
  queueAction(runtime, 0, 'bite', 20);
  for (let i = 2; i <= 60; i++) frameRuntime(runtime, i * 1000 / 60);
  assert.equal(runtime.world.fighters[0].attackId, 1);
  assert.equal(runtime.world.fighters[0].phase, 'idle');
});
test('non-frame-aligned timestamped inputs produce identical 60Hz outcomes at 30/60/144Hz', () => {
  const script = [[90, 'direction', 1], [425, 'bite'], [427, 'dash'], [511, 'direction', -1], [905, 'bite'], [1201, 'direction', 0], [1470, 'dash']];
  const outcomes = [30, 60, 144].map(hz => {
    const runtime = ready(); let event = 0;
    for (let frame = 1; frame <= hz * 2; frame++) {
      const now = frame * 1000 / hz;
      while (event < script.length && script[event][0] <= now) {
        const [at, kind, value] = script[event++];
        if (kind === 'direction') queueDirection(runtime, 0, value, at); else queueAction(runtime, 0, kind, at);
      }
      frameRuntime(runtime, now);
    }
    assert.equal(runtime.world.tick, 120);
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});
test('pvp samples both control queues and never asks the AI', () => {
  let decisions = 0;
  const runtime = ready({ mode: 'pvp', decideOpponent: () => { decisions++; return { bite: true }; } });
  const [p1, p2] = runtime.world.fighters;
  const start = [p1.x, p2.x];
  queueDirection(runtime, 0, -1, 1); queueAction(runtime, 0, 'dash', 1);
  queueDirection(runtime, 1, 1, 1); queueAction(runtime, 1, 'bite', 1);
  frameRuntime(runtime, 17);
  assert.equal(decisions, 0);
  assert.ok(p1.x < start[0]); assert.ok(p1.dashRemaining > 0);
  assert.equal(p2.attackId, 1);
});
test('pvp input stays deterministic across 30/60/144Hz', () => {
  const script = [
    [90, 0, 'direction', 1], [90, 1, 'direction', -1],
    [425, 0, 'bite'], [425, 1, 'shoot'],
    [427, 0, 'dash'], [427, 1, 'dash'],
    [511, 0, 'direction', -1], [511, 1, 'direction', 1],
    [905, 0, 'bite'], [905, 1, 'shoot'],
    [1201, 0, 'direction', 0], [1201, 1, 'direction', 0],
    [1470, 0, 'dash'], [1470, 1, 'dash'],
  ];
  const outcomes = [30, 60, 144].map(hz => {
    const runtime = ready({ mode: 'pvp' }); let event = 0;
    for (let frame = 1; frame <= hz * 2; frame++) {
      const now = frame * 1000 / hz;
      while (event < script.length && script[event][0] <= now) {
        const [at, fighter, kind, value] = script[event++];
        if (kind === 'direction') queueDirection(runtime, fighter, value, at); else queueAction(runtime, fighter, kind, at);
      }
      frameRuntime(runtime, now);
    }
    assert.equal(runtime.world.tick, 120);
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});
test('bot mode reserves the opponent slot for the AI', () => {
  const runtime = createRuntime();
  assert.equal(queueAction(runtime, 1, 'bite', 5), false);
  assert.equal(queueDirection(runtime, 1, 1, 5), false);
});
test('pause freezes attacks, health, cooldown and AI, clears inputs, and resumes without catch-up', () => {
  let decisions = 0;
  const runtime = ready({ decideOpponent: () => { decisions++; return {}; } });
  queueAction(runtime, 0, 'bite', 1); frameRuntime(runtime, 50);
  queueAction(runtime, 0, 'dash', 51); queueDirection(runtime, 0, 1, 51);
  pauseRuntime(runtime, true); const frozen = structuredClone(runtime.world), count = decisions;
  frameRuntime(runtime, 60000); assert.deepEqual(runtime.world, frozen); assert.equal(decisions, count);
  assert.ok(runtime.controls.every(controls => controls.inputs.length === 0 && controls.direction === 0));
  pauseRuntime(runtime, false); frameRuntime(runtime, 70000); assert.deepEqual(runtime.world, frozen);
  frameRuntime(runtime, 70017); assert.equal(runtime.world.tick, frozen.tick + 1);
});
test('pvp pause and restart clear both fighters\' input state', () => {
  const runtime = ready({ mode: 'pvp' });
  queueAction(runtime, 0, 'bite', 1); queueDirection(runtime, 1, 1, 1);
  pauseRuntime(runtime, true);
  assert.ok(runtime.controls.every(controls => controls.inputs.length === 0 && controls.direction === 0));
  pauseRuntime(runtime, false);
  runtime.controls[1].inputs.push({ kind: 'direction', value: 1, at: 2 });
  restartRuntime(runtime);
  assert.equal(runtime.mode, 'pvp');
  assert.ok(runtime.controls.every(controls => controls.inputs.length === 0 && controls.direction === 0));
});
test('restart clears round/combat/AI/clock/input state and is intentionally unpaused', () => {
  const runtime = ready({ createOpponent: () => ({ decisions: 0 }), decideOpponent: ai => { ai.decisions++; return {}; } });
  queueAction(runtime, 0, 'bite', 1); frameRuntime(runtime, 100);
  runtime.world.fighters[0].hp = 20; runtime.world.winner = 'opponent'; runtime.world.status = 'ended';
  pauseRuntime(runtime, true); assert.equal(runtime.paused, false);
  restartRuntime(runtime);
  assert.equal(runtime.ready, true); assert.equal(runtime.paused, false);
  assert.equal(runtime.world.tick, 0); assert.equal(runtime.world.winner, null);
  assert.deepEqual(runtime.world.fighters.map(f => [f.hp, f.attackId, f.cooldown, f.phase]), [[100, 0, 0, 'idle'], [100, 0, 0, 'idle']]);
  assert.equal(runtime.ai.decisions, 0);
  assert.ok(runtime.controls.every(controls => controls.inputs.length === 0));
  frameRuntime(runtime, 50000); assert.equal(runtime.world.tick, 0);
});
test('invalid/backward times do not progress; a long stall runs at most six ticks then rebases events', () => {
  const clock = createClock(); let ticks = 0;
  runClock(clock, 0, () => ticks++);
  for (const time of [NaN, Infinity, -10, 0]) runClock(clock, time, () => ticks++);
  assert.equal(ticks, 0);
  assert.equal(runClock(clock, 10000, () => ticks++), 6);
  const runtime = ready(); frameRuntime(runtime, 10000);
  queueAction(runtime, 0, 'bite', 10001); frameRuntime(runtime, 10017);
  assert.equal(runtime.world.fighters[0].attackId, 1);
  assert.equal(runtime.world.tick, 7);
});
