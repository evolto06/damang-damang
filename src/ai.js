import { COMBAT, clearGap } from './combat.js';
import { isAttached } from './aerial.js';

export const AI_RULES = Object.freeze({ initialWait: 60, decisionDelay: 30, rangeMargin: Math.min(0.005, COMBAT.reach / 4) });

export function createAI() {
  return { state: 'opening_wait', readyAt: AI_RULES.initialWait };
}

// Called once before each fixed simulation tick. Observe world state only:
// never inspect player input or cancel an already committed bite.
export function decideAI(ai, world) {
  const action = { direction: 0, bite: false, dash: false };
  if (world.status !== 'playing') return action;
  if (!world.fighters.every(isAttached)) {
    ai.state = 'aerial_hold';
    return action;
  }
  // Start grace at the first attached observation, even after a long absence.
  // A deadline left over from before the drop cannot permit an instant attack.
  if (ai.state === 'aerial_hold') {
    ai.readyAt = Math.max(ai.readyAt, world.tick + AI_RULES.decisionDelay);
    ai.state = 'return_grace';
  }
  const opponent = world.fighters[1];
  if (opponent.hp <= 0) return action;
  if (opponent.phase !== 'idle' || opponent.dashRemaining > 0) {
    ai.state = 'committed';
    return action;
  }
  if (ai.state === 'committed') {
    ai.readyAt = Math.max(ai.readyAt, world.tick + AI_RULES.decisionDelay);
    ai.state = 'decision_wait';
  }
  if (world.tick < ai.readyAt) return action;
  if (clearGap(world) <= COMBAT.reach - AI_RULES.rangeMargin) {
    action.bite = true;
    ai.state = 'committed';
  } else {
    action.direction = Math.sign(world.fighters[0].x - opponent.x);
    ai.state = 'approach';
  }
  return action;
}
