import { COMBAT, clearGap } from './combat.js';
import { isAttached } from './aerial.js';
import { sameStick, stickAt } from './stage.js';

export const AI_RULES = Object.freeze({ initialWait: 60, decisionDelay: 30, minDelay: 18, maxDelay: 48, retreatTicks: 25, castDelay: 30, rangeMargin: Math.min(0.005, COMBAT.reach / 4) });
export function createAI(seed = 0x6d2b79f5) {
  return { state: 'opening_wait', readyAt: AI_RULES.initialWait, seed: seed >>> 0 || 1, retreatUntil: 0, lastHitAttack: 0, seenWindup: -1 };
}
function random(ai) {
  let value = ai.seed; value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  ai.seed = value >>> 0; return ai.seed / 0x100000000;
}
const delay = ai => AI_RULES.minDelay + Math.floor(random(ai) * (AI_RULES.maxDelay - AI_RULES.minDelay + 1));

// Decisions use only visible simulation state, never input queues. Seeded choices
// are sampled at decisions, so render frequency cannot alter the opponent.
export function decideAI(ai, world) {
  const action = { direction: 0, bite: false, dash: false };
  if (world.status !== 'playing') return action;
  const [player, me] = world.fighters;
  const toward = Math.sign(player.x - me.x) || me.forward;
  if (me.attackHit && me.attackId !== ai.lastHitAttack) {
    ai.lastHitAttack = me.attackId; ai.pendingRetreat = true;
  }
  if (!isAttached(me)) {
    ai.state = 'aerial_hold';
    const away = Math.sign(me.x - player.x) || -me.forward;
    const steer = me.air.blocked ? (me.air.clearDirection || away) : sameStick(me.x, player.x, world.stage) ? 0 : -away;
    return { ...action, direction: steer, web: me.air.mode === 'grounded' || (me.air.mode === 'falling' && me.air.ticks >= (ai.castDelay ?? AI_RULES.castDelay)) };
  }
  if (!isAttached(player)) { ai.state = 'aerial_hold'; return action; }
  if (ai.state === 'aerial_hold') {
    ai.readyAt = Math.max(ai.readyAt, world.tick + AI_RULES.decisionDelay); ai.state = 'return_grace';
  }
  // Grace applies to approaching a gap as well as approaching an opponent.
  if (world.tick < ai.readyAt && ['opening_wait', 'return_grace'].includes(ai.state)) return action;
  if (!sameStick(player.x, me.x, world.stage)) {
    const [low, high] = stickAt(me.x, world.stage), edge = player.x > me.x ? high : low;
    if (Math.abs(me.x - edge) < 0.05 && me.phase === 'idle' && me.dashRemaining <= 0) {
      ai.castDelay = ai.crossing ? Math.min(60, (ai.castDelay ?? AI_RULES.castDelay) + 15) : AI_RULES.castDelay;
      ai.crossing = true; ai.state = 'aerial_hold';
      return { ...action, direction: toward, drop: true };
    }
    return { ...action, direction: Math.sign(edge - me.x) };
  }
  ai.crossing = false;
  if (me.hp <= 0) return action;
  if (me.phase !== 'idle' || me.dashRemaining > 0) { ai.state = 'committed'; return action; }
  if (ai.state === 'committed') {
    ai.readyAt = Math.max(ai.readyAt, world.tick + delay(ai)); ai.state = 'decision_wait';
  }
  if (ai.pendingRetreat) {
    ai.pendingRetreat = false; ai.retreatUntil = world.tick + AI_RULES.retreatTicks;
    ai.readyAt = Math.max(ai.readyAt, ai.retreatUntil);
  }
  if (world.tick < ai.retreatUntil) { ai.state = 'retreat'; return { ...action, direction: -toward }; }
  const gap = clearGap(world), inRange = gap <= COMBAT.reach - AI_RULES.rangeMargin;
  if (player.phase === 'windup' && gap < 0.75 && player.attackId !== ai.seenWindup) {
    ai.seenWindup = player.attackId;
    if (random(ai) < 0.78) {
      ai.dodgeUntil = world.tick + 12; ai.dodgeDash = random(ai) < 0.35 && me.cooldown <= 1e-8;
    }
  }
  if (world.tick < (ai.dodgeUntil ?? 0)) {
    const dash = ai.dodgeDash; ai.dodgeDash = false; ai.state = 'dodge';
    return { ...action, direction: -toward, dash };
  }
  if (player.phase === 'recovery' && inRange) { ai.state = 'committed'; return { ...action, bite: true }; }
  if (world.tick < ai.readyAt) return action;
  if (inRange) { action.bite = true; ai.state = 'committed'; }
  else { action.direction = toward; ai.state = 'approach'; }
  return action;
}
