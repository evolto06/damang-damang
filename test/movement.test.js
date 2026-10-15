import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, createState, RULES } from '../src/movement.js';

function simulate(hz, seconds, direction, dash = false) {
  const state = createState();
  for (let frame = 0; frame < hz * seconds; frame++) advance(state, { direction, dash: dash && frame === 0 }, 1 / hz);
  return state;
}

test('travel and lunge distance agree at 30, 60, and 144 Hz', () => {
  for (const dash of [false, true]) {
    const positions = [30, 60, 144].map(hz => simulate(hz, 0.5, -1, dash).x);
    assert.ok(Math.max(...positions) - Math.min(...positions) < 0.012, positions.join(', '));
  }
});
test('retreat and a lunge cannot leave either end or pass through the opponent', () => {
  const state = simulate(60, 5, -1, true);
  assert.equal(state.x, -RULES.limit);
  for (let frame = 0; frame < 600; frame++) advance(state, { direction: 1, dash: frame % 60 === 0 }, 1 / 60);
  assert.equal(state.x, state.opponentX - RULES.separation);
  assert.equal(state.velocity, 0);
});
test('lunge cooldown rejects a second press and becomes available again', () => {
  const state = createState();
  advance(state, { direction: -1, dash: true }, 0.05);
  const first = state.dashRemaining;
  advance(state, { direction: -1, dash: true }, 0.05);
  assert.ok(state.dashRemaining < first);
  for (let frame = 0; frame < 60; frame++) advance(state, { direction: 0 }, 1 / 60);
  assert.equal(state.cooldown, 0);
  advance(state, { direction: 1, dash: true }, 1 / 60);
  assert.ok(state.dashRemaining > 0);
});
test('release brakes to a stop and idle lunge faces the opponent', () => {
  const state = simulate(60, 0.5, -1);
  for (let i = 0; i < 30; i++) advance(state, { direction: 0 }, 1 / 60);
  assert.equal(state.velocity, 0);
  const before = state.x;
  advance(state, { direction: 0, dash: true }, 0.1);
  assert.ok(state.x > before);
});
test('nonfinite or nonpositive time does not corrupt state', () => {
  const state = createState();
  const before = structuredClone(state);
  for (const delta of [NaN, Infinity, -1, 0]) advance(state, { direction: 1, dash: true }, delta);
  assert.deepEqual(state, before);
});
