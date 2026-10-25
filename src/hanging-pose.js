import { AIR, outletOffset } from './aerial.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

// Presentation only: sample fixed simulation age, never integrate render deltas.
export function hangingPose(fighter, forward = fighter?.forward ?? 1) {
  const air = fighter?.air;
  if (!air || air.mode === 'attached')
    return {
      blend: 0,
      upright: 0,
      pitch: 0,
      phase: 0,
      motion: 0,
      climb: 0,
      drift: 0,
    };
  const age = air.animationTicks ?? air.ticks;
  const blend =
    air.mode === 'reattaching'
      ? 1 - smooth(air.ticks / AIR.reattachTicks)
      : air.mode === 'falling'
        ? smooth(age / 10)
        : 1;
  const suspended = ['deploying', 'swinging', 'reeling', 'reattaching'].includes(air.mode);
  // Rotation adds height to the silhouette. Keep the calibrated folded envelope
  // near the floor and below an opponent, and settle before the final twig grip.
  const clearance =
    smooth(((air.targetY ?? 0) - air.y - 0.65) / 0.35) * smooth((air.y - AIR.groundY - 0.35) / 0.5);
  const phase = age * 0.14;
  const drift = clamp((air.vx * forward) / AIR.maxSwingSpeed, -1, 1);
  const offset = outletOffset({ forward });
  const ropeX = air.anchorX - (fighter.x + offset[0]);
  const ropeY = air.anchorY - (air.y + offset[1]);
  const lean = Math.atan2(ropeX * forward, Math.max(0.1, ropeY));
  const motion = suspended ? blend * smooth((air.y - AIR.groundY) / 0.3) : 0;
  const pitch =
    clamp(0.1 * Math.sin(phase * 0.55) + 0.24 * drift + 0.18 * lean, -0.38, 0.38) *
    motion *
    clearance;
  const climb =
    air.mode === 'reeling' && !air.blocked
      ? smooth(air.ticks / 10) * clamp(air.vy / AIR.reelSpeed, 0, 1)
      : 0;
  const retrieving = ['deploying', 'swinging', 'reeling', 'reattaching'].includes(air.mode);
  const upright =
    smooth(age / 18) * (retrieving ? smooth(((air.targetY ?? 0) - air.y - 0.3) / 0.9) : 1);
  return { blend, upright, pitch, phase, motion, climb, drift };
}
