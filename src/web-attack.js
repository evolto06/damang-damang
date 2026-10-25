import { BITE } from "./bite-profile.js";
import { AIR, isAttached } from "./aerial.js";

export const WEB = Object.freeze({
  windup: 20,
  release: 2,
  recovery: 10,
  stun: 40,
  cooldown: 150,
  speed: 8,
  lifetime: 90,
  range: 3,
  radius: 0.045,
  rise: BITE.webRise,
  curl: -2.1,
  clearance: 1.6,
  pivot: [0, 1.1, -0.55],
});
const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function webPose(phase, ticks = 0) {
  let stand = 0,
    curl = 0;
  if (phase === "webwindup") {
    stand = smooth((ticks + 1) / WEB.windup);
    curl = smooth((ticks + 1 - 7) / (WEB.windup - 7));
  }
  if (phase === "webrelease") stand = curl = 1;
  if (phase === "webrecovery")
    stand = curl = 1 - smooth((ticks + 1) / WEB.recovery);
  // The source ventral side is native -Y (world up while inverted).
  // Lower the connected torso as the rear sweeps toward that side, giving
  // the abdomen room below the twig throughout the arc and its recovery.
  const clearance = WEB.clearance * Math.sin(Math.abs(WEB.curl) * curl);
  return { webStand: stand + clearance / WEB.rise, webCurl: curl };
}
// Native -Y becomes world up under the permanent inverted stance. The
// abdomen rotates about the pedicel; head and jaws stay attached to the torso.
export function posedSpinneret(fighter, pose = fighter.pose) {
  const angle = (pose?.webCurl ?? 0) * WEB.curl,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const y = AIR.outlet[1] - WEB.pivot[1],
    z = AIR.outlet[2] - WEB.pivot[2];
  const localY =
    WEB.pivot[1] + y * c - z * s + WEB.rise * (pose?.webStand ?? 0);
  const localZ = WEB.pivot[2] + y * s + z * c;
  return [
    fighter.x + fighter.forward * localZ * BITE.scale,
    (fighter.air?.y ?? 0) + BITE.offsetY - localY * BITE.scale,
    fighter.forward * AIR.outlet[0] * BITE.scale,
  ];
}
export function headCenter(fighter) {
  return [
    fighter.x + fighter.forward * 0.6 * BITE.scale,
    (fighter.air?.y ?? 0) +
      BITE.offsetY -
      (1.12 + WEB.rise * (fighter.pose?.webStand ?? 0)) * BITE.scale,
    0,
  ];
}
export function launchWeb(fighter, target, source) {
  const position = posedSpinneret(fighter),
    aim = headCenter(target);
  const delta = aim.map((value, axis) => value - position[axis]),
    length = Math.hypot(...delta);
  return {
    source,
    position,
    previous: [...position],
    origin: [...position],
    velocity: delta.map((value) => ((value / length) * WEB.speed) / 60),
    age: 0,
    travelled: 0,
  };
}
// Sweep the finite bolt against a moving head volume inside the supplied
// prosoma silhouette. Relative motion prevents tunnelling during a lunge.
export function webContact(shot, target, previousTarget) {
  if (!isAttached(target) || target.hp <= 0 || target.phase === "ko")
    return null;
  const startCenter = headCenter(previousTarget),
    endCenter = headCenter(target);
  const radius = [
    0.82 * BITE.scale + WEB.radius,
    0.38 * BITE.scale + WEB.radius,
    0.52 * BITE.scale + WEB.radius,
  ];
  const start = shot.previous.map(
    (value, axis) => (value - startCenter[axis]) / radius[axis],
  );
  const end = shot.position.map(
    (value, axis) => (value - endCenter[axis]) / radius[axis],
  );
  const delta = end.map((value, axis) => value - start[axis]);
  const a = delta.reduce((sum, value) => sum + value * value, 0),
    b = 2 * delta.reduce((sum, value, axis) => sum + value * start[axis], 0);
  const c = start.reduce((sum, value) => sum + value * value, 0) - 1;
  let t;
  if (c <= 0) t = 0;
  else {
    const discriminant = b * b - 4 * a * c;
    if (a < 1e-15 || discriminant < 0) return null;
    t = (-b - Math.sqrt(discriminant)) / (2 * a);
  }
  return t >= 0 && t <= 1
    ? {
        t,
        point: shot.previous.map(
          (value, axis) => value + (shot.position[axis] - value) * t,
        ),
      }
    : null;
}
export function advanceWebs(world, previous) {
  const hits = [],
    remaining = [];
  for (const shot of world.projectiles) {
    const target = world.fighters[1 - shot.source];
    shot.previous = [...shot.position];
    const speed = Math.hypot(...shot.velocity),
      remainingRange = Math.max(0, WEB.range - shot.travelled);
    const fraction = speed > 0 ? Math.min(1, remainingRange / speed) : 0;
    if (!fraction) continue;
    shot.position = shot.position.map(
      (value, axis) => value + shot.velocity[axis] * fraction,
    );
    shot.age++;
    shot.travelled += speed * fraction;
    const contact = webContact(shot, target, previous[1 - shot.source]);
    if (contact)
      hits.push({
        type: "webhit",
        source: shot.source,
        target: 1 - shot.source,
        contact,
      });
    else if (shot.age < WEB.lifetime && shot.travelled < WEB.range)
      remaining.push(shot);
  }
  world.projectiles = remaining;
  return hits;
}
