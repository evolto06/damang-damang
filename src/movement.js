import { BITE } from './bite-profile.js';
import { clampToStick, stickAt, sameStick } from './stage.js';
export const MAP_SCALE = 1.5;
const BASE_LIMIT = 5.65, BASE_START = 2.45;
export const RULES = Object.freeze({ limit: BASE_LIMIT * MAP_SCALE, opponentX: BASE_START * MAP_SCALE, startX: -BASE_START * MAP_SCALE, separation: BITE.separation, speed: 2.5, acceleration: 18, braking: 25, dashSpeed: 8, dashDuration: 0.14, dashCooldown: 0.9 });

const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

export function createMover(x, forward) {
  return { x, forward, velocity: 0, cooldown: 0, dashRemaining: 0, dashDirection: forward, distanceTravelled: 0 };
}

export function moveFighter(fighter, action, delta, available) {
  fighter.cooldown = Math.max(0, fighter.cooldown - delta);
  if (!available) { fighter.velocity = 0; fighter.dashRemaining = 0; return; }
  const direction = Math.sign(action.direction || 0);
  if (action.dash && fighter.cooldown <= 1e-8 && fighter.dashRemaining <= 0) {
    fighter.dashDirection = direction || fighter.forward;
    fighter.dashRemaining = RULES.dashDuration;
    fighter.cooldown = RULES.dashCooldown;
  }
  let remaining = delta;
  while (remaining > 1e-9) {
    const dt = Math.min(remaining, 1 / 240, fighter.dashRemaining > 1e-9 ? fighter.dashRemaining : Infinity);
    const dashing = fighter.dashRemaining > 1e-9;
    fighter.velocity = dashing ? fighter.dashDirection * RULES.dashSpeed : approach(fighter.velocity, direction * RULES.speed, (direction ? RULES.acceleration : RULES.braking) * dt);
    fighter.x += fighter.velocity * dt;
    fighter.dashRemaining = Math.max(0, fighter.dashRemaining - dt);
    remaining -= dt;
  }
}

// Resolve the proposals together: inward movement shares the correction by its
// contribution. A stationary fighter is never pushed by ordinary movement.
export function resolveContact(fighters, previous, stage = fighters[0].stage) {
  const leftIndex = previous[0] <= previous[1] ? 0 : 1, rightIndex = 1 - leftIndex;
  const left = fighters[leftIndex], right = fighters[rightIndex];
  left.x = clampToStick(left.x, previous[leftIndex], stage); right.x = clampToStick(right.x, previous[rightIndex], stage);
  const [leftMin] = stickAt(left.x, stage), [, rightMax] = stickAt(right.x, stage);
  if (!sameStick(left.x, right.x, stage)) {
    for (const fighter of fighters) {
      const [low, high] = stickAt(fighter.x, stage);
      if ((fighter.x <= low && fighter.velocity < 0) || (fighter.x >= high && fighter.velocity > 0)) fighter.velocity = 0;
    }
    return;
  }
  const overlap = RULES.separation - (right.x - left.x);
  if (overlap > 0) {
    const inwardLeft = Math.max(0, left.x - previous[leftIndex]);
    const inwardRight = Math.max(0, previous[rightIndex] - right.x);
    const total = inwardLeft + inwardRight;
    const share = total > 1e-9 ? inwardLeft / total : 0.5;
    left.x -= overlap * share;
    right.x += overlap * (1 - share);
    if (left.x < leftMin) { left.x = leftMin; right.x = left.x + RULES.separation; }
    if (right.x > rightMax) { right.x = rightMax; left.x = right.x - RULES.separation; }
    if (left.velocity > 0) left.velocity = 0;
    if (right.velocity < 0) right.velocity = 0;
  }
  if (left.x <= leftMin && left.velocity < 0) left.velocity = 0;
  if (right.x >= rightMax && right.velocity > 0) right.velocity = 0;
}
