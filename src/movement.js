export const RULES = Object.freeze({ limit: 5.65, opponentX: 2.45, startX: -2.45, separation: 1.27, speed: 2.5, acceleration: 18, braking: 25, dashSpeed: 8, dashDuration: 0.14, dashCooldown: 0.9 });

export function createState() {
  return { x: RULES.startX, velocity: 0, opponentX: RULES.opponentX, cooldown: 0, dashRemaining: 0, dashDirection: 1, distanceTravelled: 0, lastMove: 1 };
}

const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

// Substeps keep acceleration, dash duration, and contact consistent across render rates.
export function advance(state, input, delta) {
  if (!Number.isFinite(delta) || delta <= 0) return state;
  const direction = Math.max(-1, Math.min(1, input.direction || 0));
  if (input.dash && state.cooldown <= 1e-8) {
    state.dashDirection = direction || Math.sign(state.opponentX - state.x) || 1;
    state.dashRemaining = RULES.dashDuration;
    state.cooldown = RULES.dashCooldown;
  }
  let remaining = Math.min(delta, 0.25);
  while (remaining > 1e-9) {
    const dt = Math.min(remaining, 1 / 240, state.dashRemaining > 1e-9 ? state.dashRemaining : Infinity);
    remaining -= dt;
    state.cooldown = Math.max(0, state.cooldown - dt);
    const dashing = state.dashRemaining > 1e-9;
    state.velocity = dashing ? state.dashDirection * RULES.dashSpeed : approach(state.velocity, direction * RULES.speed, (direction ? RULES.acceleration : RULES.braking) * dt);
    const previous = state.x;
    const minX = -RULES.limit;
    const maxX = Math.min(RULES.limit, state.opponentX - RULES.separation);
    state.x = Math.max(minX, Math.min(maxX, state.x + state.velocity * dt));
    if (state.x === minX && state.velocity < 0 || state.x === maxX && state.velocity > 0) state.velocity = 0;
    state.distanceTravelled += Math.abs(state.x - previous);
    if (direction) state.lastMove = direction;
    state.dashRemaining = Math.max(0, state.dashRemaining - dt);
  }
  return state;
}
