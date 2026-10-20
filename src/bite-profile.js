// Calibrated against the supplied GLB in its native (+Z forward) coordinates.
// Original chelicera top attachment, fang base-ring center, and sharp apex.
// The front four planes are actual lower-front prosoma triangle planes;
// five caps restrict damage to a small patch inside that visible body mesh.
export const BITE = Object.freeze({ scale: 0.22, offsetY: -0.06, separation: 0.74, jawPivot: [-0.23, 1.08655945, 1.46], fangPivot: [-0.24, 0.59655947, 1.59], tip: [-0.055, 0.49655944, 1.74000001] });
export const HURT_PLANES = Object.freeze([
  [0.276865304, -0.483041581, 0.830672278, 0.820835687],
  [-0.276865286, -0.483041688, 0.830672223, 0.820835480],
  [0.138147472, -0.899511489, 0.414480829, -0.151169130],
  [-0.138147621, -0.899511469, 0.414480822, -0.151169103],
  [1, 0, 0, 0.12], [-1, 0, 0, 0.12],
  [0, 1, 0, 1.08655945], [0, -1, 0, -0.67952755], [0, 0, -1, -1.1],
]);
const lerp = (a, b, t) => a + (b - a) * t;
// Foreleg weights share the sampled/frozen bite pose, including impact frames.
export const mixPose = (a, b, t) => Object.fromEntries(['jaw', 'fang', 'rear', 'strike'].map(key => [key, lerp(a[key] ?? 0, b[key] ?? 0, t)]));
const smooth = t => t * t * (3 - 2 * t);
const forelegPose = (phase, ticks) => {
  if (phase === 'windup') return { rear: smooth(Math.min(1, (ticks + 1) / 18)), strike: 0 };
  if (phase === 'active') { const snap = smooth(Math.min(1, (ticks + 1) / 3)); return { rear: 1 - snap, strike: snap }; }
  if (phase === 'recovery') return { rear: 0, strike: 1 - smooth(Math.min(1, (ticks + 1) / 21)) };
  return { rear: 0, strike: 0 };
};
export function bitePose(phase, ticks = 0) {
  return { ...jawPose(phase, ticks), ...forelegPose(phase, ticks) };
}
function jawPose(phase, ticks) {
  if (phase === 'windup') return mixPose({ jaw: 0, fang: 0 }, { jaw: 0.15, fang: 0.45 }, Math.min(1, (ticks + 1) / 18));
  if (phase === 'active') return mixPose({ jaw: 0.15, fang: 0.45 }, { jaw: -0.65, fang: -0.8 }, Math.min(1, (ticks + 1) / 3));
  if (phase === 'recovery') return mixPose({ jaw: -0.65, fang: -0.8 }, { jaw: 0, fang: 0 }, Math.min(1, (ticks + 1) / 21));
  return { jaw: 0, fang: 0 };
}
const rotateAtX = (point, pivot, angle) => {
  const y = point[1] - pivot[1], z = point[2] - pivot[2], c = Math.cos(angle), s = Math.sin(angle);
  return [point[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
};
export function fangPoint(pose, side = -1) {
  const point = rotateAtX(rotateAtX(BITE.tip, BITE.fangPivot, pose.fang), BITE.jawPivot, pose.jaw);
  point[0] *= -side; return point;
}
export function worldFang(fighter, pose, side = -1) {
  const point = fangPoint(pose, side);
  return [fighter.x + fighter.forward * point[2] * BITE.scale, BITE.offsetY - point[1] * BITE.scale, fighter.forward * point[0] * BITE.scale];
}
export function hurtContains(point, target) {
  const local = [point[2] / (target.forward * BITE.scale), (BITE.offsetY - point[1]) / BITE.scale, (point[0] - target.x) / (target.forward * BITE.scale)];
  return HURT_PLANES.every(([x, y, z, distance]) => x * local[0] + y * local[1] + z * local[2] <= distance + 1e-9);
}
// Sweep the real apex on its connected two-hinge arc. Sixteen samples per
// fixed tick are finer than the narrowest hurt-patch width at maximum dash.
// Binary refinement returns the actual joint pose at first visible contact.
export function biteContact(attacker, target, previousAttacker, previousTarget) {
  const evaluate = (t, side) => {
    const pose = mixPose(previousAttacker.pose, attacker.pose, t);
    const source = { ...attacker, x: lerp(previousAttacker.x, attacker.x, t) };
    const defender = { ...target, x: lerp(previousTarget.x, target.x, t) };
    const point = worldFang(source, pose, side);
    return { t, pose, point, inside: hurtContains(point, defender) };
  };
  let earliest = null;
  for (const side of [-1, 1]) {
    for (let sample = 0; sample <= 16; sample++) {
      let result = evaluate(sample / 16, side);
      if (!result.inside) continue;
      let low = Math.max(0, (sample - 1) / 16), high = sample / 16;
      for (let iteration = 0; iteration < 28; iteration++) {
        const mid = (low + high) / 2;
        if (evaluate(mid, side).inside) high = mid; else low = mid;
      }
      result = evaluate(high, side);
      if (!earliest || result.t < earliest.t) earliest = { ...result, side };
      break;
    }
  }
  return earliest;
}
function maximumDistance() {
  let reach = 0;
  for (let sample = 0; sample <= 120; sample++) {
    const point = fangPoint(mixPose({ jaw: 0.15, fang: 0.45 }, { jaw: -0.65, fang: -0.8 }, sample / 120));
    if (point[1] < 0.67952755 || point[1] > 1.08655945) continue;
    const front = Math.min(...HURT_PLANES.filter(p => p[2] > 0).map(([x, y, z, d]) => (d + x * point[0] - y * point[1]) / z));
    reach = Math.max(reach, (point[2] + front) * BITE.scale);
  }
  return reach;
}
export const BITE_CENTER_REACH = maximumDistance();
