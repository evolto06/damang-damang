import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeries,
  scoreRound,
  nextSeriesRound,
  createCoaching,
  advanceCoaching,
  coachingHint,
} from '../src/match-flow.js';
import { keysFor } from '../src/feedback.js';
import { createImpactFeedback, updateImpactFeedback } from '../src/impact-feedback.js';
import {
  createRuntime,
  setReady,
  queueDirection,
  queueAction,
  frameRuntime,
  pauseRuntime,
  restartRuntime,
} from '../src/runtime.js';

test('first to two wins scores each round once, draws replay, and completed matches cannot continue', () => {
  const series = createSeries();
  assert.equal(scoreRound(series, 'draw'), true);
  assert.deepEqual(series.wins, [0, 0]);
  assert.equal(scoreRound(series, 'player'), false);
  assert.equal(nextSeriesRound(series), true);
  scoreRound(series, 'player');
  nextSeriesRound(series);
  scoreRound(series, 'opponent');
  assert.equal(series.complete, false);
  nextSeriesRound(series);
  scoreRound(series, 'player');
  assert.deepEqual(series.wins, [2, 1]);
  assert.equal(series.complete, true);
  assert.equal(nextSeriesRound(series), false);
  assert.deepEqual(createSeries().wins, [0, 0]);
});

test('coaching accepts ordered actual actions and uses each active input vocabulary', () => {
  const coaching = createCoaching(),
    before = { distanceTravelled: 0, webId: 0, attackId: 0 };
  advanceCoaching(coaching, before, { ...before, webId: 1 });
  assert.equal(coaching.step, 'move');
  advanceCoaching(coaching, before, { ...before, distanceTravelled: 0.1 });
  assert.equal(coaching.step, 'shoot');
  assert.match(coachingHint(coaching, keysFor('bot', 0, 'controller')).text, /Y \/ Top/);
  assert.match(coachingHint(coaching, keysFor('bot', 0, 'touch')).text, /Shoot web/);
  advanceCoaching(coaching, before, { ...before, webId: 1 });
  assert.equal(coaching.step, 'bite');
  advanceCoaching(coaching, before, { ...before, attackId: 1 });
  assert.equal(coaching.step, 'done');
  assert.equal(coachingHint(coaching, keysFor()), null);
  assert.equal(createCoaching(false).step, 'done');
});

test('first-match bot waits for actual movement, coaching and AI freeze while paused, round reset preserves step', () => {
  let decisions = 0;
  const runtime = createRuntime({
    decideOpponent: () => {
      decisions++;
      return {};
    },
  });
  runtime.coaching = createCoaching();
  setReady(runtime, true);
  frameRuntime(runtime, 0);
  frameRuntime(runtime, 50);
  assert.equal(decisions, 0);
  assert.equal(runtime.coaching.step, 'move');
  queueAction(runtime, 0, 'shoot', 51);
  frameRuntime(runtime, 67);
  assert.equal(runtime.coaching.step, 'move');
  // Wait for recovery: rejected movement cannot complete the coaching step.
  queueDirection(runtime, 0, 1, 68);
  for (let time = 84; time < 1800; time += 17) frameRuntime(runtime, time);
  assert.equal(runtime.coaching.step, 'shoot');
  assert.ok(decisions > 0);
  pauseRuntime(runtime, true);
  const count = decisions,
    step = runtime.coaching.step;
  frameRuntime(runtime, 10000);
  assert.equal(decisions, count);
  assert.equal(runtime.coaching.step, step);
  restartRuntime(runtime);
  assert.equal(runtime.coaching.step, 'shoot');
  assert.equal(runtime.world.tick, 0);
});

test('impact feedback retains damage across multi-tick frames, pauses lifetime, and disables reduced-motion shake', () => {
  const state = createImpactFeedback(),
    fighters = [
      { hp: 100, x: 0, air: { y: 0 } },
      { hp: 100, x: 1, air: { y: 0.9 } },
    ];
  updateImpactFeedback(state, fighters, 0);
  fighters[1].hp = 75;
  let feedback = updateImpactFeedback(state, fighters, 0.02);
  assert.deepEqual(
    feedback.items.map((item) => [item.target, item.damage, item.y]),
    [[1, 25, 0.9]],
  );
  assert.equal(feedback.flashes[1], true);
  assert.notEqual(feedback.shake.y, 0);
  updateImpactFeedback(state, fighters, 50, { paused: true });
  assert.equal(state.items[0].age, 0);
  feedback = updateImpactFeedback(state, fighters, 0.1, { reducedMotion: true });
  assert.deepEqual(feedback.shake, { x: 0, y: 0 });
  assert.equal(updateImpactFeedback(state, fighters, 0.8).items.length, 0);
});
