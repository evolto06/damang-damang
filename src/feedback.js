import { isAttached } from './aerial.js';
import { COMBAT, clearGap } from './combat.js';
import { sameStick, stickAt } from './stage.js';

export const phaseLabels = {
  idle: 'Ready',
  windup: 'Windup',
  active: 'Bite active',
  recovery: 'Recovering',
  lungewindup: 'Lunge windup',
  lungeactive: 'Lunge strike',
  lungerecovery: 'Lunge recovery',
  hitstun: 'Hit · wait',
  webwindup: 'Web windup',
  webrelease: 'Web release',
  webrecovery: 'Web recovery',
  webstun: 'Web stunned',
  ko: 'KO',
};
const airLabels = {
  falling: 'Falling',
  grounded: 'On pavement',
  deploying: 'Casting silk',
  swinging: 'Swinging',
  reeling: 'Climbing',
  reattaching: 'Gripping',
};
export function keysFor(mode = 'bot', index = 0, input = 'keyboard') {
  if (input === 'controller')
    return {
      left: 'D-pad ←',
      right: 'D-pad →',
      move: 'D-pad ← / →',
      bite: 'X / Left',
      shoot: 'Y / Top',
      dash: 'A / Bottom',
      drop: 'D-pad ↓',
      web: 'B / Right',
    };
  if (input === 'touch')
    return {
      left: '←',
      right: '→',
      move: '← / →',
      bite: 'Bite',
      shoot: 'Shoot web',
      dash: 'Lunge',
      drop: 'Drop',
      web: 'Return',
    };
  if (mode === 'pvp')
    return index
      ? {
          left: '←',
          right: '→',
          move: '← / →',
          bite: ',',
          shoot: '.',
          dash: '/',
          drop: '↓',
          web: '↑',
        }
      : {
          left: 'A',
          right: 'D',
          move: 'A / D',
          bite: 'Q',
          shoot: 'E',
          dash: 'F',
          drop: 'S',
          web: 'W',
        };
  return {
    left: 'A',
    right: 'D',
    move: 'A / D',
    bite: 'J',
    shoot: 'K',
    dash: 'SHIFT / SPACE',
    drop: '↓ / S',
    web: 'C',
  };
}
function clearLabel(fighter, keys) {
  return fighter.air.clearDirection < 0
    ? keys.left
    : fighter.air.clearDirection > 0
      ? keys.right
      : keys.move;
}
// Pure choices shared by world labels and touch button emphasis. No DOM or input.
export function hintsFor(world, index = 0, mode = 'bot', input = 'keyboard') {
  const fighter = world.fighters[index],
    opponent = world.fighters[1 - index];
  const keys = keysFor(mode, index, input);
  const hint = (action, verb, key = keys[action]) => ({
    action,
    key,
    verb,
    text: input === 'touch' && key === verb ? verb : `${key} ${verb}`,
  });
  if (world.status !== 'playing' || fighter.hp <= 0 || world.hitstop > 0) return [];
  if (!isAttached(fighter)) {
    if (fighter.air.blocked) return [hint('move', 'Clear', clearLabel(fighter, keys))];
    if (['falling', 'grounded'].includes(fighter.air.mode)) return [hint('web', 'Return')];
    if (['swinging', 'reeling'].includes(fighter.air.mode)) return [hint('move', 'Steer')];
    return [];
  }
  if (fighter.phase !== 'idle' || fighter.dashRemaining > 1e-9) return [];
  if (!isAttached(opponent)) return [hint('move', 'Reposition')];
  if (!sameStick(fighter.x, opponent.x, world.stage)) {
    const toward = fighter.x < opponent.x ? 1 : -1;
    const edge = stickAt(fighter.x, world.stage)[toward > 0 ? 1 : 0];
    return Math.abs(edge - fighter.x) > 1
      ? [hint('move', 'Approach gap', toward > 0 ? keys.right : keys.left)]
      : [hint('drop', 'Cross gap')];
  }
  const gap = clearGap(world);
  if (gap <= COMBAT.reach + 1e-9) return [hint('bite', 'Bite')];
  if (opponent.phase === 'webstun') return [hint('move', 'Close in'), hint('bite', 'Bite')];
  return [];
}
const returnPrompt = (fighter, keys) =>
  ({
    falling: `Falling · Press ${keys.web} / Web to return.`,
    grounded: `Pavement hurts · Press ${keys.web} / Web to return now.`,
    deploying: 'Casting silk · Return is automatic.',
    swinging: `Swinging · ${keys.move} steers; climbing starts automatically.`,
    reeling: `Climbing · ${keys.move} steers; wait for the grip.`,
    reattaching: 'Gripping the stick · Wait for your legs to attach.',
  })[fighter.air.mode];

// Presentation reads the same eligibility gates as combat; it never queues input.
export function fightFeedback(runtime, index = 0) {
  const { world, ready, paused } = runtime;
  const player = world.fighters[index],
    opponent = world.fighters[1 - index];
  const pvp = runtime.mode === 'pvp';
  const keys = keysFor(runtime.mode, index, runtime.inputSources?.[index]);
  const opponentName = pvp ? (index ? 'P1' : 'P2') : 'Opponent';
  const lifecycle =
    world.status !== 'playing' ? 'Round over' : paused ? 'Paused' : !ready ? 'Loading' : '';
  const frozen = lifecycle || (world.hitstop > 0 ? 'Contact hold' : '');
  const attached = isAttached(player),
    waiting = attached && !isAttached(opponent);
  const dashing = player.dashRemaining > 1e-9;
  const busy = player.phase !== 'idle' ? phaseLabels[player.phase] : dashing ? 'Lunging' : '';
  const stickReason = frozen || (!attached ? airLabels[player.air.mode] : busy);
  const attackReason = stickReason || (waiting ? 'Opponent airborne' : '');
  const dropReason = frozen || (!attached ? airLabels[player.air.mode] : busy);
  const cooling = player.cooldown > 1e-8;
  const dashReason =
    stickReason || (cooling ? `Wait ${(Math.ceil(player.cooldown * 10) / 10).toFixed(1)}s` : '');
  const canWeb = ['falling', 'grounded'].includes(player.air.mode);
  const webReason =
    frozen || (!canWeb ? (attached ? 'Drop first' : airLabels[player.air.mode]) : '');
  const shootReason =
    attackReason ||
    (player.webCooldown > 0 ? `Wait ${(Math.ceil(player.webCooldown / 6) / 10).toFixed(1)}s` : '');
  let prompt = `Close in, then ${keys.bite} bites; ${keys.shoot} shoots a stunning web.`;
  if (world.status !== 'playing') prompt = 'Round over · Choose Fight again or press R to restart.';
  else if (paused) prompt = 'Paused · Resume with Esc or the Resume button.';
  else if (!ready) prompt = 'Preparing the spiders · Controls unlock when loading finishes.';
  else if (world.hitstop > 0) prompt = 'Contact · Brief impact hold; actions resume automatically.';
  else if (!attached)
    prompt = player.air.blocked
      ? player.air.blockReason === 'height'
        ? `Twig too high · Steer ${clearLabel(player, keys)} back beneath your silk anchor.`
        : `${opponentName} above · Steer ${clearLabel(player, keys)} to clear them and keep climbing.`
      : returnPrompt(player, keys);
  else if (player.phase === 'webstun') prompt = 'Web stunned · Briefly trapped; wait to recover.';
  else if (player.phase === 'webwindup')
    prompt = 'Web windup · Stand tall and curl the abdomen forward.';
  else if (player.phase === 'webrelease' || player.phase === 'webrecovery')
    prompt = `Web released · After recovery, close in and ${keys.bite} bites.`;
  else if (opponent.phase === 'webstun')
    prompt = `${opponentName} web stunned · Close in and ${keys.bite} bites before the net loosens.`;
  else if (player.phase === 'windup')
    prompt = 'Bite windup · Committed; wait for contact, then recovery.';
  else if (player.phase === 'active')
    prompt = 'Bite active · Fangs must touch the opponent to deal damage.';
  else if (player.phase === 'recovery')
    prompt = 'Bite recovery · Wait before moving, biting, lunging or dropping.';
  else if (player.phase === 'hitstun') prompt = 'Hit · Wait to recover before acting again.';
  else if (player.phase === 'lungewindup')
    prompt = 'Lunge windup · Direction committed; the strike follows.';
  else if (player.phase === 'lungeactive')
    prompt = 'Lunge strike · Evades webs; bites can interrupt.';
  else if (player.phase === 'lungerecovery')
    prompt = 'Lunge recovery · Exposed after the strike; wait before acting.';
  else if (dashing) prompt = 'Lunging · Wait for the lunge to finish before biting or dropping.';
  else if (waiting)
    prompt = `${opponentName} returning · Move to reposition, lunge or drop; bites wait for their grip.`;
  else if (!sameStick(player.x, opponent.x, world.stage))
    prompt = `Across the gap · Move to the inner end; ${keys.drop} drops; steer ${player.x < opponent.x ? keys.right : keys.left} across, then ${keys.web} returns.`;
  else if (cooling) prompt = 'On stick · Bite and movement ready; lunge is cooling down.';
  return {
    prompt,
    cooling,
    phases: world.fighters.map(
      (fighter) => lifecycle || airLabels[fighter.air.mode] || phaseLabels[fighter.phase],
    ),
    actions: {
      shoot: {
        disabled: !!shootReason,
        caption: shootReason || `${keys.shoot} · STUN`,
      },
      bite: { disabled: !!attackReason, caption: attackReason || keys.bite },
      dash: { disabled: !!dashReason, caption: dashReason || keys.dash },
      drop: { disabled: !!dropReason, caption: dropReason || keys.drop },
      web: { disabled: !!webReason, caption: webReason || keys.web },
    },
    movementDisabled:
      !!frozen ||
      (attached ? player.phase !== 'idle' : ['grounded', 'reattaching'].includes(player.air.mode)),
  };
}
