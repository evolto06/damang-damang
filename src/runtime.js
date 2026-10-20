import { createWorld, stepWorld, COMBAT } from './combat.js';

export const CLOCK = Object.freeze({ step: 1 / COMBAT.tickRate, maxDelta: 0.1, maxSteps: 6 });
export const createClock = () => ({ previous: null, accumulator: 0, simulationTime: 0 });
export function resetClock(clock) { clock.previous = null; clock.accumulator = 0; clock.simulationTime = 0; }
export function runClock(clock, timestamp, callback) {
  if (!Number.isFinite(timestamp)) return 0;
  if (clock.previous === null) { clock.previous = timestamp; clock.simulationTime = timestamp; return 0; }
  const delta = (timestamp - clock.previous) / 1000;
  if (delta <= 0) return 0;
  clock.previous = timestamp;
  clock.simulationTime += Math.max(0, delta - CLOCK.maxDelta) * 1000;
  clock.accumulator += Math.min(delta, CLOCK.maxDelta);
  let steps = 0;
  while (clock.accumulator + 1e-10 >= CLOCK.step && steps < CLOCK.maxSteps) {
    clock.accumulator = Math.max(0, clock.accumulator - CLOCK.step);
    steps++;
    clock.simulationTime += CLOCK.step * 1000;
    if (callback(clock.simulationTime) === false) { clock.accumulator = 0; break; }
  }
  if (steps === CLOCK.maxSteps && clock.accumulator >= CLOCK.step) { clock.simulationTime += clock.accumulator * 1000; clock.accumulator = 0; }
  return steps;
}
export function createRuntime({ createOpponent = () => ({}), decideOpponent = () => ({}) } = {}) {
  return { world: createWorld(), clock: createClock(), ready: false, paused: false, alpha: 1, direction: 0, inputs: [], createOpponent, decideOpponent, ai: createOpponent() };
}
export function clearActions(runtime) { runtime.direction = 0; runtime.inputs.length = 0; }
export function setReady(runtime, ready) { runtime.ready = ready; runtime.alpha = 1; clearActions(runtime); resetClock(runtime.clock); }
function queue(runtime, kind, value, timestamp) {
  if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return false;
  const at = Number.isFinite(timestamp) ? timestamp : runtime.clock.previous ?? 0;
  runtime.inputs.push({ kind, value, at });
  runtime.inputs.sort((a, b) => a.at - b.at);
  return true;
}
// Events are consumed once at their first eligible tick, including when a busy
// fighter rejects them. They never become a buffered attack after recovery.
export const queueAction = (runtime, kind, timestamp) => ['bite', 'dash', 'drop', 'web'].includes(kind) && queue(runtime, kind, true, timestamp);
export const queueDirection = (runtime, direction, timestamp) => queue(runtime, 'direction', Math.sign(direction), timestamp);
export function pauseRuntime(runtime, value) {
  clearActions(runtime); resetClock(runtime.clock);
  if (runtime.world.status === 'ended') return false;
  runtime.paused = value; return true;
}
export function restartRuntime(runtime) {
  runtime.world = createWorld(); runtime.ai = runtime.createOpponent(); runtime.paused = false; runtime.alpha = 1;
  clearActions(runtime); resetClock(runtime.clock);
}
export function frameRuntime(runtime, timestamp) {
  if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') { resetClock(runtime.clock); runtime.alpha = 1; return 0; }
  const rebased = runtime.clock.previous === null;
  const steps = runClock(runtime.clock, timestamp, tickTime => {
    const player = { direction: runtime.direction, bite: false, dash: false };
    while (runtime.inputs.length && runtime.inputs[0].at <= tickTime + 1e-7) {
      const input = runtime.inputs.shift();
      if (input.kind === 'direction') runtime.direction = player.direction = input.value;
      else player[input.kind] = true;
    }
    const opponent = runtime.world.hitstop > 0 ? {} : runtime.decideOpponent(runtime.ai, runtime.world);
    stepWorld(runtime.world, [player, opponent]);
    if (runtime.world.status === 'ended') { clearActions(runtime); return false; }
    return true;
  });
  // Alpha is the fraction of the next fixed tick already elapsed. Presentation
  // blends the last two tick states with it instead of snapping at 60 Hz. A
  // clock rebase has no previous tick to blend from, so show the current state.
  runtime.alpha = runtime.world.status === 'playing' && !rebased ? Math.max(0, Math.min(1, runtime.clock.accumulator / CLOCK.step)) : 1;
  return steps;
}
