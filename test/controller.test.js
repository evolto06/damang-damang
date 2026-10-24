import test from 'node:test';
import assert from 'node:assert/strict';
import { createControllerInput, normalizeGamepad, combinedDirection } from '../src/controller.js';
import { RULES } from '../src/movement.js';
import { createRuntime, setReady, frameRuntime, queueAction, queueDirection } from '../src/runtime.js';

const context = overrides => ({ started: true, ready: true, paused: false, ended: false, focused: true, mode: 'bot', ...overrides });
const pad = (pressed = [], overrides = {}) => ({ index: 0, id: 'Simulated controller', connected: true, mapping: 'standard', timestamp: 0, buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0 })), ...overrides });
const armed = () => { const input = createControllerInput(); input.poll([pad()], 0, context()); return input; };

test('standard positions work independent of Xbox, PlayStation, or Switch labels; nonstandard is explicit', () => {
  for (const id of ['Xbox Wireless Controller', 'DualSense', 'Switch Pro Controller']) {
    const input = armed();
    const sample = input.poll([pad([0, 1, 2, 3, 13, 14], { id: 'Simulated controller' })], 10, context());
    assert.deepEqual(sample.actions.map(action => action.kind), ['bite', 'shoot', 'dash', 'drop', 'web']);
    assert.deepEqual(sample.direction, { value: -1, at: 10 });
    assert.equal(normalizeGamepad(pad([], { id }), 10).supported, true);
  }
  const result = createControllerInput().poll([pad([2], { mapping: '' })], 10, context());
  assert.equal(result.unsupported, true); assert.equal(result.connected, false); assert.deepEqual(result.actions, []);
  assert.equal(normalizeGamepad(pad([], { buttons: [] }), 0).supported, false);
});

test('all actions are edges; opposing dpad cancels and release stops movement', () => {
  const input = armed();
  assert.equal(input.poll([pad([2, 15])], 1, context()).actions.length, 1);
  assert.deepEqual(input.poll([pad([2, 15])], 2, context()).actions, []);
  assert.equal(input.poll([pad([14, 15])], 3, context()).direction.value, 0);
  assert.equal(input.poll([pad([14])], 4, context()).direction.value, -1);
  assert.equal(input.poll([pad()], 5, context()).direction.value, 0);
  assert.equal(input.poll([pad([2])], 6, context()).actions.length, 1);
});

test('menu launch waits for assets, discards held presses, and consumes launch without a lunge', () => {
  const input = createControllerInput();
  const loading = context({ started: false, ready: false });
  input.poll([pad()], 0, loading);
  assert.equal(input.poll([pad([0, 2])], 1, loading).command, null);
  const menu = context({ started: false });
  assert.equal(input.poll([pad([0])], 2, menu).command, null);
  input.poll([pad()], 3, menu);
  const launch = input.poll([pad([0, 2])], 4, menu);
  assert.equal(launch.command, 'start'); assert.deepEqual(launch.actions, []);
  assert.deepEqual(input.poll([pad([0, 2])], 5, context()).actions, []);
  input.poll([pad()], 6, context());
  assert.equal(input.poll([pad([0])], 7, context()).actions[0].kind, 'dash');
});

test('Start toggles pause/resume once per press and result bottom restarts without combat', () => {
  const input = armed();
  assert.equal(input.poll([pad([9, 2])], 1, context()).command, 'pause');
  const paused = context({ paused: true });
  assert.equal(input.poll([pad([9, 2])], 2, paused).command, null);
  input.poll([pad()], 3, paused);
  const resume = input.poll([pad([9, 0])], 4, paused);
  assert.equal(resume.command, 'resume'); assert.deepEqual(resume.actions, []);
  const ended = context({ ended: true });
  input.poll([pad()], 5, ended);
  const restart = input.poll([pad([0])], 6, ended);
  assert.equal(restart.command, 'restart'); assert.deepEqual(restart.actions, []);
});

test('disconnect releases only controller movement; reconnect, reset and focus loss require neutral', () => {
  const input = armed();
  input.poll([pad([15])], 1, context());
  const lost = input.poll([], 2, context());
  assert.equal(lost.command, null);
  assert.deepEqual(lost.directions, [{ fighter: 0, value: 0, at: 2 }]);
  assert.deepEqual(input.poll([pad([2, 15])], 3, context()).actions, []);
  input.poll([pad()], 4, context());
  assert.equal(input.poll([pad([2])], 5, context()).actions.length, 1);
  input.reset();
  assert.deepEqual(input.poll([pad([2])], 6, context()).actions, []);
  input.poll([pad()], 7, context());
  input.poll([pad([2])], 8, context({ focused: false }));
  assert.deepEqual(input.poll([pad([2])], 9, context()).actions, []);
  input.poll([pad()], 10, context());
  assert.equal(input.poll([pad([2])], 11, context()).actions.length, 1);
});

test('first connected supported pad owns P1 until disconnect; unsupported pads cannot steal it', () => {
  const input = createControllerInput(), second = pad([2], { index: 1, id: 'Second' });
  input.poll([pad(), second], 0, context());
  assert.deepEqual(input.poll([pad(), second], 1, context()).actions, []);
  assert.equal(input.poll([pad([3]), second], 2, context()).actions[0].kind, 'shoot');
  const replacement = input.poll([pad([2], { mapping: '' }), second], 3, context());
  assert.equal(replacement.command, null); assert.deepEqual(replacement.actions, []);
});

test('movement source release preserves other held sources without stuck directions', () => {
  assert.equal(combinedDirection(1, 0, -1), 0);
  assert.equal(combinedDirection(0, 0, -1), -1);
  assert.equal(combinedDirection(0, 1, 0), 1);
  assert.equal(combinedDirection(0, 0, 0), 0);
});

test('timestamped controller edges enter fixed ticks once at 30/60/144 render Hz', () => {
  const script = [[90, [15]], [425, [15, 2]], [511, [14]], [1201, []], [1250, [2]], [1351, []], [1470, [0]], [1505, []]];
  const outcomes = [30, 60, 144].map(hz => {
    const input = armed(), runtime = createRuntime();
    setReady(runtime, true); frameRuntime(runtime, 0);
    let event = 0, pressed = [], at = 0;
    for (let frame = 1; frame <= hz * 2; frame++) {
      const now = frame * 1000 / hz;
      while (event < script.length && script[event][0] <= now) [at, pressed] = script[event++];
      const result = input.poll([pad(pressed, { timestamp: at })], now, context());
      if (result.direction) queueDirection(runtime, 0, result.direction.value, result.direction.at);
      for (const action of result.actions) queueAction(runtime, 0, action.kind, action.at);
      frameRuntime(runtime, now);
    }
    assert.equal(runtime.world.tick, 120); assert.equal(runtime.world.fighters[0].attackId, 2);
    assert.equal(runtime.controls[0].inputs.length, 0);
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});


test('two controller slots keep independent movement and edges even when browser enumeration changes', () => {
  const input = createControllerInput(), pvp = context({ mode: 'pvp' });
  const pads = (left = [], right = []) => [pad(left), pad(right, { index: 1, id: 'Second' })];
  input.poll(pads(), 0, pvp);
  const sample = input.poll(pads([14, 2], [15, 3]).reverse(), 7, pvp);
  assert.deepEqual(sample.directions, [{ fighter: 0, value: -1, at: 7 }, { fighter: 1, value: 1, at: 7 }]);
  assert.deepEqual(sample.actions, [{ fighter: 0, kind: 'bite', at: 7 }, { fighter: 1, kind: 'shoot', at: 7 }]);
  const held = input.poll(pads([14, 2], [15, 3]), 8, pvp);
  assert.deepEqual(held.actions, []); assert.deepEqual(held.directions, []);
  assert.deepEqual(input.poll(pads([], [15, 3]), 9, pvp).directions, [{ fighter: 0, value: 0, at: 9 }]);
});

test('one controller can select and launch PvP while the other slot is absent or held', () => {
  for (const second of [[], [pad([0, 2], { index: 1, id: 'Second' })]]) {
    const input = createControllerInput(), menu = context({ started: false });
    input.poll([pad(), ...second], 0, menu);
    assert.equal(input.poll([pad([13]), ...second], 1, menu).selectedMode, 'pvp');
    input.poll([pad(), ...second], 2, menu);
    const start = input.poll([pad([0]), ...second], 3, menu);
    assert.equal(start.command, 'start'); assert.equal(start.selectedMode, 'pvp'); assert.deepEqual(start.actions, []);
  }
});

test('pads join during play after neutral and replacement fills vacancy without moving the other player', () => {
  const input = createControllerInput(), pvp = context({ mode: 'pvp' });
  const second = buttons => pad(buttons, { index: 1, id: 'Second' });
  input.poll([], 0, pvp);
  assert.deepEqual(input.poll([pad([2, 15])], 1, pvp).actions, []);
  assert.deepEqual(input.poll([pad([2, 15])], 2, pvp).directions, []);
  input.poll([pad()], 3, pvp);
  assert.deepEqual(input.poll([pad([15]), second([2])], 4, pvp).directions, [{ fighter: 0, value: 1, at: 4 }]);
  input.poll([pad([15]), second([])], 5, pvp);
  const replacement = pad([14, 2], { index: 2, id: 'Replacement' });
  const lost = input.poll([second([15]), replacement], 6, pvp);
  assert.equal(lost.command, null); assert.deepEqual(lost.actions, []);
  assert.deepEqual(lost.directions, [{ fighter: 0, value: 0, at: 6 }, { fighter: 1, value: 1, at: 6 }]);
  assert.deepEqual(lost.slots.map(slot => slot.key), ['2:Replacement', '1:Second']);
  input.poll([second([15]), { ...replacement, buttons: pad().buttons }], 7, pvp);
  assert.deepEqual(input.poll([second([15]), replacement], 8, pvp).actions, [{ fighter: 0, kind: 'bite', at: 8 }]);
});

test('zero-pad PvP and mixed sources keep independent keyboard directions through neutral and disconnect', () => {
  const input = createControllerInput(), pvp = context({ mode: 'pvp' });
  const runtime = createRuntime({ mode: 'pvp' }); setReady(runtime, true); frameRuntime(runtime, 0);
  const keyboard = [1, -1], directions = [0, 0];
  const apply = (pads, time) => {
    const sample = input.poll(pads, time, pvp);
    assert.equal(sample.command, null);
    for (const direction of sample.directions) directions[direction.fighter] = direction.value;
    for (let fighter = 0; fighter < 2; fighter++) queueDirection(runtime, fighter, combinedDirection(keyboard[fighter], 0, directions[fighter]), time);
    frameRuntime(runtime, time + 17);
    return runtime.controls.map(control => control.direction);
  };
  assert.deepEqual(apply([], 1), [1, -1]);
  assert.deepEqual(apply([pad()], 30), [1, -1]);
  assert.deepEqual(apply([pad([14])], 60), [0, -1]);
  assert.deepEqual(apply([], 90), [1, -1]);
  assert.deepEqual(apply([pad(), pad([], { index: 1, id: 'Second' })], 120), [1, -1]);
  assert.deepEqual(apply([pad([15]), pad([15], { index: 1, id: 'Second' })], 150), [1, 0]);
  assert.deepEqual(apply([pad([15])], 180), [1, -1]);
});

test('either PvP controller pauses or restarts without leaking the other player combat; bot ignores P2', () => {
  const input = createControllerInput(), pvp = context({ mode: 'pvp' });
  const second = pressed => pad(pressed, { index: 1, id: 'Second' });
  input.poll([pad(), second()], 0, pvp);
  const pause = input.poll([pad([2]), second([9])], 1, pvp);
  assert.equal(pause.command, 'pause'); assert.deepEqual(pause.actions, []);
  const ended = context({ mode: 'pvp', ended: true });
  input.poll([pad(), second()], 2, ended);
  const restart = input.poll([pad([2]), second([0])], 3, ended);
  assert.equal(restart.command, 'restart'); assert.deepEqual(restart.actions, []);
  const bot = createControllerInput(); bot.poll([pad(), second()], 0, context());
  const ignored = bot.poll([pad(), second([9, 2, 15])], 1, context());
  assert.equal(ignored.command, null); assert.deepEqual(ignored.actions, []); assert.deepEqual(ignored.directions, []);
});

test('two controller queues trade bites and stay identical at 30/60/144 render Hz without AI decisions', () => {
  const script = [[90, [2], [2]], [425, [], []], [620, [3], [0]], [851, [], []], [1201, [13], [13]], [1301, [], []], [1470, [1], [1]], [1505, [], []]];
  const outcomes = [30, 60, 144].map(hz => {
    let decisions = 0;
    const input = createControllerInput(), runtime = createRuntime({ mode: 'pvp', decideOpponent: () => { decisions++; return {}; } });
    const pvp = context({ mode: 'pvp' });
    const pads = (a, b, at) => [pad(a, { timestamp: at }), pad(b, { index: 1, id: 'Second', timestamp: at })];
    input.poll(pads([], [], 0), 0, pvp);
    setReady(runtime, true); runtime.world.fighters[0].x = 0;
    // Existing contact distance: both fang tips can hit on the same fixed tick.
    runtime.world.fighters[1].x = RULES.separation;
    frameRuntime(runtime, 0);
    let event = 0, left = [], right = [], at = 0;
    for (let frame = 1; frame <= hz * 2; frame++) {
      const now = frame * 1000 / hz;
      while (event < script.length && script[event][0] <= now) [at, left, right] = script[event++];
      const sample = input.poll(pads(left, right, at), now, pvp);
      for (const direction of sample.directions) queueDirection(runtime, direction.fighter, direction.value, direction.at);
      for (const action of sample.actions) queueAction(runtime, action.fighter, action.kind, action.at);
      frameRuntime(runtime, now);
    }
    assert.equal(decisions, 0); assert.equal(runtime.world.tick, 120);
    assert.deepEqual(runtime.world.fighters.map(f => f.hp), [80, 80]);
    assert.ok(runtime.controls.every(controls => controls.inputs.length === 0));
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});
