// The fixed 60 Hz simulation owns inactivity and blend age. Rendering is pure,
// so pausing or drawing the same tick again cannot advance this animation.
export const IDLE = Object.freeze({ delay: 180, enter: 24, exit: 12, period: 90, amplitude: 0.1 });
const smooth = (t) => t * t * (3 - 2 * t);
export const createIdle = () => ({ quietTicks: 0, animationTicks: 0, blend: 0 });
const hasInput = (action) =>
  !!(
    action.activity ||
    action.direction ||
    action.bite ||
    action.shoot ||
    action.dash ||
    action.drop ||
    action.web
  );

export function advanceIdle(world, actions, hitstop = false) {
  // Bite/web collision uses the calibrated, unshifted GLB. Settle BOTH spiders
  // before any attack presentation, including a stationary defending spider.
  const combat =
    hitstop ||
    world.status !== 'playing' ||
    world.projectiles.length > 0 ||
    world.fighters.some((f) => f.phase !== 'idle' || f.dashRemaining > 1e-9);
  world.fighters.forEach((fighter, index) => {
    const idle = fighter.idleBounce;
    idle.quietTicks = hasInput(actions[index] ?? {})
      ? 0
      : Math.min(IDLE.delay + 1, idle.quietTicks + 1);
    if (combat || fighter.air.mode !== 'attached') {
      idle.blend = 0;
      idle.animationTicks = 0;
      return;
    }
    const resting = idle.quietTicks > IDLE.delay && Math.abs(fighter.velocity) < 1e-8;
    idle.blend = resting
      ? Math.min(1, idle.blend + 1 / IDLE.enter)
      : Math.max(0, idle.blend - 1 / IDLE.exit);
    if (idle.blend < 1e-9) idle.blend = 0;
    idle.animationTicks = idle.blend > 0 ? (idle.animationTicks + 1) % IDLE.period : 0;
  });
}

export function idlePose(fighter) {
  const idle = fighter?.idleBounce;
  if (
    !idle ||
    fighter.phase !== 'idle' ||
    fighter.air?.mode !== 'attached' ||
    fighter.dashRemaining > 1e-9
  )
    return { blend: 0, lift: 0 };
  const blend = smooth(idle.blend);
  // Native +Y points down after the persistent upside-down attachment rotation.
  const lift =
    (IDLE.amplitude * blend * (1 - Math.cos((idle.animationTicks / IDLE.period) * Math.PI * 2))) /
    2;
  return { blend, lift };
}
