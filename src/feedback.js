import { isAttached } from './aerial.js';

export const phaseLabels = { idle: 'Ready', windup: 'Windup', active: 'Bite active', recovery: 'Recovering', hitstun: 'Hit · wait', ko: 'KO' };
const airLabels = { falling: 'Falling', grounded: 'On pavement', deploying: 'Casting silk', swinging: 'Swinging', reeling: 'Climbing', reattaching: 'Gripping' };
const returnPrompts = {
  falling: 'Falling · Press C / Web to cast silk and return. A / D steers.',
  grounded: 'On pavement · Press C / Web to return. There is no time limit.',
  deploying: 'Casting silk · Return is automatic. A / D steers.',
  swinging: 'Swinging · A / D builds swing momentum; climbing starts automatically.',
  reeling: 'Climbing · A / D steers; wait for the grip.',
  reattaching: 'Gripping the stick · Wait for your legs to attach.',
};

// Presentation reads the same eligibility gates as combat; it never queues input.
export function fightFeedback(runtime) {
  const { world, ready, paused } = runtime;
  const [player, opponent] = world.fighters;
  const lifecycle = world.status !== 'playing' ? 'Round over' : paused ? 'Paused' : !ready ? 'Loading' : '';
  const frozen = lifecycle || (world.hitstop > 0 ? 'Contact hold' : '');
  const attached = isAttached(player), waiting = attached && !isAttached(opponent);
  const dashing = player.dashRemaining > 1e-9;
  const busy = player.phase !== 'idle' ? phaseLabels[player.phase] : dashing ? 'Lunging' : '';
  const stickReason = frozen || (!attached ? airLabels[player.air.mode] : waiting ? 'Return hold' : busy);
  const dropReason = frozen || (!attached ? airLabels[player.air.mode] : busy);
  const cooling = player.cooldown > 1e-8;
  const dashReason = stickReason || (cooling ? `Wait ${(Math.ceil(player.cooldown * 10) / 10).toFixed(1)}s` : '');
  const canWeb = ['falling', 'grounded'].includes(player.air.mode);
  const webReason = frozen || (!canWeb ? attached ? 'Drop first' : airLabels[player.air.mode] : '');
  let prompt = 'On stick · J / Bite attacks; Shift / Space lunges; ↓ / S drops.';
  if (world.status !== 'playing') prompt = 'Round over · Choose Fight again or press R to restart.';
  else if (paused) prompt = 'Paused · Resume with Esc or the Resume button.';
  else if (!ready) prompt = 'Preparing the spiders · Controls unlock when loading finishes.';
  else if (world.hitstop > 0) prompt = 'Contact · Brief impact hold; actions resume automatically.';
  else if (!attached) prompt = player.air.blocked ? 'Opponent above · Steer A / D left or right to clear them and keep climbing.' : returnPrompts[player.air.mode];
  else if (waiting) prompt = 'Opponent returning · Movement, bite and lunge wait for their grip.';
  else if (player.phase === 'windup') prompt = 'Bite windup · Committed; wait for contact, then recovery.';
  else if (player.phase === 'active') prompt = 'Bite active · Fangs must touch the opponent to deal damage.';
  else if (player.phase === 'recovery') prompt = 'Bite recovery · Wait before moving, biting, lunging or dropping.';
  else if (player.phase === 'hitstun') prompt = 'Hit · Wait to recover before acting again.';
  else if (dashing) prompt = 'Lunging · Wait for the lunge to finish before biting or dropping.';
  else if (cooling) prompt = 'On stick · Bite and movement ready; lunge is cooling down.';
  return {
    prompt, cooling,
    phases: world.fighters.map((fighter, index) => lifecycle || airLabels[fighter.air.mode] || (!isAttached(world.fighters[1 - index]) ? 'Return hold' : phaseLabels[fighter.phase])),
    actions: {
      bite: { disabled: !!stickReason, caption: stickReason || 'J' },
      dash: { disabled: !!dashReason, caption: dashReason || 'SHIFT / SPACE' },
      drop: { disabled: !!dropReason, caption: dropReason || '↓ / S' },
      web: { disabled: !!webReason, caption: webReason || 'C · RETURN' },
    },
    movementDisabled: !!frozen || (attached ? waiting || player.phase !== 'idle' : ['grounded', 'reattaching'].includes(player.air.mode)),
  };
}
