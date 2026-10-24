import { BITE } from './bite-profile.js';
import { MAP_SCALE, RULES } from './movement.js';
import { clampToStick, clampToTwig, span, twigAt, sameStick } from './stage.js';

const STICK_LIFT = 1.3;
export const AIR = Object.freeze({ gravity: 8, terminalSpeed: 6.5, groundY: -3.3347 - STICK_LIFT, stickY: 1.4 + STICK_LIFT, stickRadius: 0.075, leftRadius: 0.066, stickLeft: -6.7 * MAP_SCALE, stickRight: 7.7 * MAP_SCALE, deployTicks: 6, swingTicks: 120, swingMinTicks: 30, reattachTicks: 18, reelSpeed: 2.6, reelSteer: 5, reelEngageVy: 1.0, reelRampTicks: 10, corridor: 4.2 * MAP_SCALE, clearance: 0.40, tailSpacing: 0.40, pump: 7, fallSteer: 5, swingDrag: 0.06, maxSwingSpeed: 6.5, swingGravity: 16, outlet: [-0.119999997, 0.716559473, -3.220000029] });
const DT = 1 / 60;
const SUBSTEPS = 8;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = t => t * t * (3 - 2 * t);
const smoothInverse = t => 0.5 - Math.sin(Math.asin(1 - 2 * t) / 3);
export const stickRadiusAtX = (x, stage) => {
  const [left, right] = twigAt(x, stage);
  return AIR.leftRadius + (AIR.stickRadius - AIR.leftRadius) * clamp((x - left) / (right - left), 0, 1);
};
export function stickSurfaceY(x, z, stage) {
  const radius = stickRadiusAtX(x, stage); let bottom = Infinity;
  for (let side = 0; side < 10; side++) {
    const a = side * Math.PI / 5, b = (side + 1) * Math.PI / 5;
    const za = Math.cos(a) * radius, zb = Math.cos(b) * radius;
    if ((z - za) * (z - zb) <= 0 && Math.abs(zb - za) > 1e-9) {
      const t = (z - za) / (zb - za);
      bottom = Math.min(bottom, Math.sin(a) * radius + (Math.sin(b) - Math.sin(a)) * radius * t);
    }
  }
  return bottom;
}
export const isAttached = fighter => !fighter.air || fighter.air.mode === 'attached';
export const createAir = () => ({ mode: 'attached', y: 0, vx: 0, vy: 0, ticks: 0, animationTicks: 0, anchorX: 0, anchorY: 0, anchorZ: 0, ropeLength: 0, landingX: 0, startX: 0, startY: 0, blocked: false, clearDirection: 0, reelRamp: 1, exitVx: 0 });
export function outletOffset(fighter) {
  return [fighter.forward * AIR.outlet[2] * BITE.scale, BITE.offsetY - AIR.outlet[1] * BITE.scale, fighter.forward * AIR.outlet[0] * BITE.scale];
}
export function silkEndpoints(fighter) {
  const offset = outletOffset(fighter), air = fighter.air;
  const origin = [fighter.x + offset[0], air.y + offset[1], offset[2]];
  const anchor = [air.anchorX, air.anchorY, air.anchorZ];
  const progress = air.mode === 'deploying' ? Math.min(1, air.ticks / AIR.deployTicks) : 1;
  return { origin, anchor, end: origin.map((value, axis) => value + (anchor[axis] - value) * progress), visible: ['deploying', 'swinging', 'reeling', 'reattaching'].includes(air.mode) };
}
export function releaseStick(fighter) {
  const air = fighter.air, offset = outletOffset(fighter);
  air.mode = 'falling'; air.ticks = 0; air.y = 0; air.vx = fighter.velocity; air.vy = -0.12;
  air.landingX = fighter.x;
  air.anchorX = clampToTwig(fighter.x + offset[0], fighter.x, fighter.stage);
  air.anchorZ = offset[2]; air.anchorY = stickSurfaceY(air.anchorX, air.anchorZ, fighter.stage);
  air.reelRamp = 1;
  fighter.velocity = 0; fighter.dashRemaining = 0;
}
// Frozen airborne headings keep the real spinneret and silk anchor continuous.
// On the far side the abdomens face inward until the silk disappears, requiring
// extra clearance during the grip. Attached combat resumes at normal spacing.
export function landingSeparation(fighter, other) {
  const side = Math.sign(fighter.x - other.x) || -fighter.forward;
  return RULES.separation + AIR.tailSpacing * (Number(fighter.forward === side) + Number(other.forward === -side));
}
const ceiling = other => (other.air?.y ?? 0) - AIR.clearance;
const underOpponent = (fighter, other) => sameStick(fighter.x, other.x, fighter.stage) && Math.abs(fighter.x - other.x) < landingSeparation(fighter, other) - 1e-9;
export function legalBounds(fighter, other, index) {
  const [spanLow, spanHigh] = span(fighter.stage);
  let low = Math.max(spanLow, fighter.air.landingX - AIR.corridor);
  let high = Math.min(spanHigh, fighter.air.landingX + AIR.corridor);
  // A released spider may change horizontal order only below the complete
  // opponent silhouette. Against its underside, retain sideways steering.
  if (fighter.air.y > ceiling(other) + 1e-9 ||
      (fighter.air.y >= ceiling(other) - 1e-9 && !underOpponent(fighter, other))) {
    const separation = landingSeparation(fighter, other);
    if (fighter.x < other.x) high = Math.min(high, other.x - separation);
    else low = Math.max(low, other.x + separation);
  }
  // An opponent pushed past a rail can leave no legal slot. Keep the spider on
  // its own side instead of producing an empty interval that teleports it.
  if (low > high) {
    const edge = clamp(fighter.x <= other.x ? high : low, spanLow, spanHigh);
    return [edge, edge];
  }
  return [low, high];
}
function legalX(fighter, other, index, value) {
  return clamp(value, ...legalBounds(fighter, other, index));
}
// Powered retrieval prescribes vertical speed and eases the winch in after a
// swing, so pull starts from the momentum the arc actually produced instead of
// reversing it instantly. The winch carries the spider's weight, so steering is
// only the player's tangential force: under the opponent it must be able to
// build sideways speed and clear them instead of being dragged back to the
// anchor. Horizontal swing momentum persists through the climb.
function advanceReeling(fighter, other, index, offset, direction) {
  const air = fighter.air, centerX = air.anchorX - offset[0], centerY = air.anchorY - offset[1];
  air.reelRamp = Math.min(1, air.reelRamp + 1 / AIR.reelRampTicks);
  const climb = AIR.reelSpeed * smooth(air.reelRamp);
  const dt = DT / SUBSTEPS, startY = air.y;
  for (let step = 0; step < SUBSTEPS; step++) {
    const angle = Math.atan2(fighter.x - centerX, centerY - air.y);
    air.vx += direction * AIR.reelSteer * Math.cos(angle) * dt;
    air.vx = clamp(air.vx * Math.exp(-AIR.swingDrag * dt), -AIR.maxSwingSpeed, AIR.maxSwingSpeed);
    const x = fighter.x + air.vx * dt;
    fighter.x = legalX(fighter, other, index, x);
    if (Math.abs(fighter.x - x) > 1e-9) air.vx = 0;
    let nextY = Math.min(-0.001, air.y + climb * dt);
    if (air.y <= ceiling(other) + 1e-9 && nextY > ceiling(other) && underOpponent(fighter, other)) {
      nextY = ceiling(other); air.blocked = true;
    }
    air.y = nextY;
    air.ropeLength = Math.hypot(fighter.x - centerX, centerY - air.y);
  }
  air.vy = (air.y - startY) / DT;
}

// Integrate angular momentum about the actual silk attachment. Gravity and
// player force act along the tangent of the fixed-length free swing.
function advancePendulum(fighter, other, index, offset, direction) {
  const air = fighter.air, centerX = air.anchorX - offset[0], centerY = air.anchorY - offset[1];
  let angle = Math.atan2(fighter.x - centerX, centerY - air.y);
  let momentum = air.ropeLength * (air.vx * Math.cos(angle) + air.vy * Math.sin(angle));
  const dt = DT / SUBSTEPS;
  for (let step = 0; step < SUBSTEPS; step++) {
    const length = air.ropeLength;
    momentum += length * (direction * AIR.pump * Math.cos(angle) - AIR.swingGravity * Math.sin(angle)) * dt;
    momentum *= Math.exp(-AIR.swingDrag * dt);
    momentum = clamp(momentum, -AIR.maxSwingSpeed * length, AIR.maxSwingSpeed * length);
    const previousAngle = angle;
    const freeAngle = angle + momentum / (length * length) * dt;
    const [low, high] = legalBounds(fighter, other, index);
    // Obstacles stop tangential motion while keeping the outlet on the rope's
    // circle. Clamping x and y separately would stretch or slacken visible silk.
    const topAngle = Math.acos(clamp((centerY + 0.001) / length, 0, 1));
    angle = clamp(freeAngle, Math.max(-topAngle, Math.asin(clamp((low - centerX) / length, -1, 1))),
      Math.min(topAngle, Math.asin(clamp((high - centerX) / length, -1, 1))));
    const floorAngle = Math.acos(clamp((centerY - AIR.groundY) / length, 0, 1));
    if (Math.abs(angle) < floorAngle) angle = (Math.sign(previousAngle) || Math.sign(angle) || 1) * floorAngle;
    const candidate = { ...fighter, x: centerX + length * Math.sin(angle) };
    const candidateY = centerY - length * Math.cos(angle);
    if (air.y <= ceiling(other) + 1e-9 && candidateY > ceiling(other) && underOpponent(candidate, other)) {
      angle = (Math.sign(angle) || Math.sign(previousAngle) || 1) * Math.acos(clamp((centerY - ceiling(other)) / length, 0, 1));
      air.blocked = true;
    }
    fighter.x = centerX + length * Math.sin(angle);
    air.y = centerY - length * Math.cos(angle);
    if (Math.abs(angle - freeAngle) > 1e-10) momentum = 0;
  }
  const speed = momentum / air.ropeLength;
  fighter.x = centerX + air.ropeLength * Math.sin(angle);
  air.y = centerY - air.ropeLength * Math.cos(angle);
  air.vx = speed * Math.cos(angle);
  air.vy = speed * Math.sin(angle);
}
export function advanceAerial(fighter, other, index, action) {
  const air = fighter.air;
  if (isAttached(fighter)) return false;
  air.blocked = false; air.clearDirection = 0;
  fighter.velocity = 0; fighter.dashRemaining = 0;
  fighter.cooldown = Math.max(0, fighter.cooldown - DT);
  const offset = outletOffset(fighter);
  const direction = Number.isFinite(action.direction) ? Math.sign(action.direction) : 0;
  if (action.web && ['falling', 'grounded'].includes(air.mode)) {
    air.mode = 'deploying'; air.ticks = 0;
    // Silk is fired from the spinneret at the moment of the cast, so the anchor
    // sits above the current position rather than the earlier drop point. A
    // moving spider otherwise attaches to a rope angled behind it, which turns
    // most of its forward speed into radial tension and kills the swing.
    air.anchorX = clampToTwig(fighter.x + offset[0], fighter.x, fighter.stage);
    air.anchorZ = offset[2];
    air.anchorY = stickSurfaceY(air.anchorX, air.anchorZ, fighter.stage);
    air.landingX = fighter.x;
  }
  if (air.mode === 'deploying') {
    air.anchorX = clampToTwig(fighter.x + offset[0], fighter.x, fighter.stage);
    air.anchorY = stickSurfaceY(air.anchorX, air.anchorZ, fighter.stage);
  }
  if (air.mode === 'grounded') return true;
  air.ticks++; air.animationTicks = (air.animationTicks ?? 0) + 1;
  if (air.mode === 'reattaching') {
    const t = Math.min(1, air.ticks / AIR.reattachTicks);
    const fall = (1 - t) * (1 - t);
    fighter.x = legalX(fighter, other, index, air.startX + (air.landingX - air.startX) * t);
    // Quadratic fall matches the reel's vertical speed on the first grip tick,
    // so the winch decelerates into the twig instead of stopping dead.
    air.y = air.startY * fall; air.vx = 0; air.vy = 0;
    air.ropeLength = Math.hypot(fighter.x + offset[0] - air.anchorX, air.y + offset[1] - air.anchorY);
    if (t === 1) { const exitVx = air.exitVx; fighter.air = createAir(); fighter.velocity = exitVx; }
    return true;
  }
  // The completed cast attaches before physics so the swing continues on this
  // tick with its falling momentum fully intact.
  if (air.mode === 'deploying' && air.ticks >= AIR.deployTicks) {
    air.ropeLength = Math.hypot(fighter.x + offset[0] - air.anchorX, air.y + offset[1] - air.anchorY);
    air.mode = 'swinging'; air.ticks = 0; air.reelRamp = 0;
  }
  if (air.mode === 'swinging') {
    advancePendulum(fighter, other, index, offset, direction);
  } else if (air.mode === 'reeling') {
    advanceReeling(fighter, other, index, offset, direction);
  } else {
    air.vx = clamp((air.vx + direction * AIR.fallSteer * DT) * Math.exp(-0.12 * DT), -AIR.maxSwingSpeed, AIR.maxSwingSpeed);
    air.vy = Math.max(-AIR.terminalSpeed, air.vy - AIR.gravity * DT);
    const x = fighter.x + air.vx * DT;
    fighter.x = legalX(fighter, other, index, x);
    if (fighter.x !== x) air.vx = 0;
    air.y = Math.max(AIR.groundY, Math.min(-0.001, air.y + air.vy * DT));
    if (air.y === AIR.groundY) {
      air.vy = 0;
      if (air.mode === 'falling') { air.mode = 'grounded'; air.vx = 0; }
    }
  }
  // The powered climb engages once the arc has had time to develop and stops
  // fighting downward momentum: switch on the upswing, or after a motionless
  // hang, or at the swing limit. The winch then eases in over a few ticks.
  if (air.mode === 'swinging') {
    const speed = Math.hypot(air.vx, air.vy);
    if (air.ticks >= AIR.swingTicks || (air.ticks >= AIR.swingMinTicks && (air.vy >= AIR.reelEngageVy || speed < 0.4))) {
      air.mode = 'reeling'; air.ticks = 0;
      // Begin the winch at the swing's current upward speed so the handoff has
      // no vertical velocity step; it then eases on to the full reel speed.
      air.reelRamp = smoothInverse(clamp(Math.max(0, air.vy) / AIR.reelSpeed, 0, 1));
    }
  } else if (air.mode === 'reeling' && air.y >= -0.28) {
    air.mode = 'reattaching'; air.ticks = 0; air.startX = fighter.x; air.startY = air.y; air.exitVx = air.vx;
    // Finish the grip where the swing and steering actually left the spider,
    // letting a little lateral momentum glide out, instead of dragging it back
    // to the cast point during the last 18 ticks.
    air.landingX = clampToStick(legalX(fighter, other, index, fighter.x + air.vx * AIR.reattachTicks * DT), fighter.x, fighter.stage);
  }
  if (air.blocked) {
    const [low, high] = legalBounds(fighter, other, index);
    const away = Math.sign(fighter.x - other.x) || -fighter.forward;
    air.clearDirection = away < 0 && fighter.x > low + 0.02 ? -1 : away > 0 && fighter.x < high - 0.02 ? 1 : fighter.x > low + 0.02 ? -1 : fighter.x < high - 0.02 ? 1 : 0;
  }
  return true;
}
