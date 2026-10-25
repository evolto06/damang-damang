import { COMBAT, clearGap } from './combat.js';
import { isAttached, AIR } from './aerial.js';
import { sameStick, stickAt, stickFor, getStage } from './stage.js';

export const AI_RULES = Object.freeze({
  initialWait: 60,
  decisionDelay: 30,
  minDelay: 18,
  maxDelay: 48,
  retreatTicks: 25,
  castDelay: 30,
  rangeMargin: Math.min(0.005, COMBAT.reach / 4),
});
export function createAI(seed = 0x6d2b79f5) {
  return {
    state: 'opening_wait',
    readyAt: AI_RULES.initialWait,
    seed: seed >>> 0 || 1,
    retreatUntil: 0,
    lastHitAttack: 0,
    seenWindup: -1,
  };
}
function random(ai) {
  let value = ai.seed;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  ai.seed = value >>> 0;
  return ai.seed / 0x100000000;
}
const delay = (ai) =>
  AI_RULES.minDelay + Math.floor(random(ai) * (AI_RULES.maxDelay - AI_RULES.minDelay + 1));

// Decisions use only visible simulation state, never input queues. Seeded choices
// are sampled at decisions, so render frequency cannot alter the opponent.
export function decideAI(ai, world) {
  const action = { direction: 0, bite: false, dash: false };
  if (world.status !== 'playing') return action;
  const [player, me] = world.fighters;
  const toward = Math.sign(player.x - me.x) || me.forward;
  if (me.attackHit && me.attackId !== ai.lastHitAttack) {
    ai.lastHitAttack = me.attackId;
    ai.pendingRetreat = true;
  }
  if (!isAttached(me)) {
    ai.state = 'aerial_hold';
    const away = Math.sign(me.x - player.x) || -me.forward;
    const target = getStage(world.stage).sticks[ai.route] ?? stickFor(player, world.stage);
    const elevated = getStage(world.stage).sticks.some((stick) => stick.y !== target.y);
    // A cast to a higher rail needs enough lateral travel to make that twig
    // nearest; once caught, retain steering until the body reaches its walkway.
    const destination = Math.max(target.walk[0] + 1, Math.min(target.walk[1] - 1, player.x));
    const onRoute = me.x >= target.walk[0] && me.x <= target.walk[1];
    const steer = me.air.blocked
      ? me.air.clearDirection || away
      : elevated
        ? onRoute
          ? 0
          : Math.sign(destination - me.x)
        : sameStick(me.x, player, world.stage)
          ? 0
          : -away;
    const castable =
      me.air.mode === 'grounded' ||
      (me.air.mode === 'falling' && me.air.ticks >= (ai.castDelay ?? AI_RULES.castDelay));
    const overTarget = me.x >= target.body[0] + 0.8 && me.x <= target.body[1] - 0.8;
    return {
      ...action,
      direction: steer,
      web:
        castable &&
        (!elevated || me.air.mode === 'grounded' || (overTarget && me.air.y < target.y - 0.1)),
    };
  }
  if (!isAttached(player)) {
    ai.state = 'aerial_hold';
    return action;
  }
  if (ai.state === 'aerial_hold') {
    ai.readyAt = Math.max(ai.readyAt, world.tick + AI_RULES.decisionDelay);
    ai.state = 'return_grace';
  }
  // Grace applies to approaching a gap as well as approaching an opponent.
  if (world.tick < ai.readyAt && ['opening_wait', 'return_grace'].includes(ai.state)) return action;
  if (!sameStick(player, me, world.stage)) {
    const own = stickFor(me, world.stage),
      goal = stickFor(player, world.stage);
    // Pick the player's rail when reachable, otherwise the closest intervening
    // rail. All routes stay inside the same finite steering corridor as players.
    const routes = getStage(world.stage).sticks.filter(
      (stick) =>
        stick !== own &&
        Math.max(0, Math.max(own.walk[0], stick.walk[0]) - Math.min(own.walk[1], stick.walk[1])) <=
          AIR.corridor,
    );
    const target = routes.includes(goal)
      ? goal
      : routes.sort(
          (a, b) =>
            Math.abs((a.walk[0] + a.walk[1]) / 2 - player.x) -
            Math.abs((b.walk[0] + b.walk[1]) / 2 - player.x),
        )[0];
    if (!target) return action;
    ai.route = getStage(world.stage).sticks.indexOf(target);
    const [low, high] = own.walk,
      edge = target.walk[0] > me.x ? high : low;
    if (Math.abs(me.x - edge) < 0.05 && me.phase === 'idle' && me.dashRemaining <= 0) {
      ai.castDelay = ai.crossing
        ? Math.min(60, (ai.castDelay ?? AI_RULES.castDelay) + 15)
        : AI_RULES.castDelay;
      ai.crossing = true;
      ai.state = 'aerial_hold';
      return { ...action, direction: toward, drop: true };
    }
    return { ...action, direction: Math.sign(edge - me.x) };
  }
  ai.crossing = false;
  if (me.hp <= 0) return action;
  if (me.phase !== 'idle' || me.dashRemaining > 0) {
    ai.state = 'committed';
    return action;
  }
  if (ai.state === 'committed') {
    ai.readyAt = Math.max(ai.readyAt, world.tick + delay(ai));
    ai.state = 'decision_wait';
  }
  if (ai.pendingRetreat) {
    ai.pendingRetreat = false;
    ai.retreatUntil = world.tick + AI_RULES.retreatTicks;
    ai.readyAt = Math.max(ai.readyAt, ai.retreatUntil);
  }
  if (world.tick < ai.retreatUntil) {
    ai.state = 'retreat';
    return { ...action, direction: -toward };
  }
  const gap = clearGap(world),
    inRange = gap <= COMBAT.reach - AI_RULES.rangeMargin;
  if (
    ['windup', 'lungewindup'].includes(player.phase) &&
    gap < 0.75 &&
    player.attackId !== ai.seenWindup
  ) {
    ai.seenWindup = player.attackId;
    if (random(ai) < 0.78) {
      ai.dodgeUntil = world.tick + 12;
      ai.dodgeDash = random(ai) < 0.35 && me.cooldown <= 1e-8;
    }
  }
  if (world.tick < (ai.dodgeUntil ?? 0)) {
    const dash = ai.dodgeDash;
    ai.dodgeDash = false;
    ai.state = 'dodge';
    return { ...action, direction: -toward, dash };
  }
  if (['recovery', 'lungerecovery'].includes(player.phase) && inRange) {
    ai.state = 'committed';
    return { ...action, bite: true };
  }
  if (world.tick < ai.readyAt) return action;
  if (gap > 0.45 && gap < 1.65 && me.webCooldown === 0 && world.tick >= (ai.nextTacticAt ?? 0)) {
    ai.nextTacticAt = world.tick + 30;
    if (random(ai) < 0.4) {
      ai.state = 'committed';
      return { ...action, shoot: true };
    }
  }
  if (inRange) {
    action.bite = true;
    ai.state = 'committed';
  } else {
    action.direction = toward;
    ai.state = 'approach';
  }
  return action;
}
