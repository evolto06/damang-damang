import { createMover, moveFighter, resolveContact, RULES } from './movement.js';
import { bitePose, biteContact, mixPose, BITE_CENTER_REACH } from './bite-profile.js';
import { WEB, webPose, launchWeb, advanceWebs } from './web-attack.js';
import { createAir, isAttached, releaseStick, advanceAerial } from './aerial.js';

export const COMBAT = Object.freeze({ tickRate: 60, windup: 18, active: 6, recovery: 21, hitstun: 11, hitstop: 6, maxHealth: 100, damage: 20, reach: BITE_CENTER_REACH - RULES.separation, knockback: 0.25 });
export const clearGap = world => Math.max(0, Math.abs(world.fighters[1].x - world.fighters[0].x) - RULES.separation);

function createFighter(id, x, forward) {
  return { ...createMover(x, forward), id, hp: COMBAT.maxHealth, air: createAir(), phase: 'idle', phaseTicks: 0, pose: bitePose('idle'), webCooldown: 0, webId: 0, attackId: 0, attackHit: false, hitTick: -1000 };
}
export function createWorld() {
  const fighters = [createFighter('player', RULES.startX, 1), createFighter('opponent', RULES.opponentX, -1)];
  return { tick: 0, status: 'playing', winner: null, hitstop: 0, projectiles: [], recoil: [0, 0], impact: null, fighters, previous: fighters.map(fighter => ({ x: fighter.x, y: fighter.air.y })), events: [] };
}
function faceOpponent(world) {
  if (!world.fighters.every(isAttached)) return;
  const direction = Math.sign(world.fighters[1].x - world.fighters[0].x) || world.fighters[0].forward;
  world.fighters[0].forward = direction; world.fighters[1].forward = -direction;
}
const enter = (fighter, phase) => { fighter.phase = phase; fighter.phaseTicks = 0; };
const fighterPose = fighter => ({ ...bitePose(fighter.phase, fighter.phaseTicks), ...webPose(fighter.phase, fighter.phaseTicks) });
function transition(fighter) {
  const duration = { webwindup: WEB.windup, webrelease: WEB.release, webrecovery: WEB.recovery, webstun: WEB.stun }[fighter.phase] ?? COMBAT[fighter.phase] ?? Infinity;
  if (fighter.phaseTicks < duration) return;
  enter(fighter, { windup: 'active', active: 'recovery', recovery: 'idle', hitstun: 'idle', webwindup: 'webrelease', webrelease: 'webrecovery', webrecovery: 'idle', webstun: 'idle' }[fighter.phase]);
}

// Tick 1..18 is windup, 19..24 active, 25..45 recovery; tick 46 is
// available again. A hit's tick is the first of its 11 stunned ticks.
// Both actions are sampled before movement. Bite takes precedence over dash.
export function stepWorld(world, actions = [{}, {}]) {
  if (world.status !== 'playing') return world;
  world.tick++;
  world.events = [];
  // Render interpolation samples the start of the current fixed tick. Hitstop
  // frames leave both ends equal, so presentation holds without ever rewinding.
  world.previous = world.fighters.map(fighter => ({ x: fighter.x, y: fighter.air.y }));
  if (world.hitstop > 0) {
    world.projectiles.forEach(shot => { shot.previous = [...shot.position]; });
    world.hitstop--;
    if (world.hitstop === 0) {
      const positions = world.fighters.map(fighter => fighter.x);
      world.fighters.forEach((fighter, index) => { fighter.x += world.recoil[index]; fighter.pose = fighterPose(fighter); });
      resolveContact(world.fighters, positions);
      world.recoil = [0, 0]; world.impact = null;
    }
    return world;
  }
  faceOpponent(world);
  const previous = world.fighters.map(fighter => ({ ...fighter, air: { ...fighter.air }, pose: { ...fighter.pose }, attached: isAttached(fighter) }));
  const dropping = world.fighters.map((fighter, index) => actions[index]?.drop && isAttached(fighter) && fighter.phase === 'idle' && fighter.dashRemaining <= 1e-9);
  world.fighters.forEach((fighter, index) => { if (dropping[index]) releaseStick(fighter); });
  for (let index = 0; index < 2; index++) {
    const fighter = world.fighters[index];
    const action = actions[index] || {};
    fighter.webCooldown = Math.max(0, fighter.webCooldown - 1);
    transition(fighter);
    if (advanceAerial(fighter, world.fighters[1 - index], index, dropping[index] ? { ...action, web: false } : action)) {
      fighter.pose = bitePose('idle'); continue;
    }
    if (!isAttached(world.fighters[1 - index])) {
      fighter.pose = fighterPose(fighter);
      moveFighter(fighter, {}, 1 / COMBAT.tickRate, false); continue;
    }
    if (action.bite && fighter.phase === 'idle' && fighter.dashRemaining <= 1e-9) {
      enter(fighter, 'windup'); fighter.attackId++; fighter.attackHit = false;
    }
    if (action.shoot && !action.bite && fighter.phase === 'idle' && fighter.webCooldown === 0 && fighter.dashRemaining <= 1e-9) {
      enter(fighter, 'webwindup'); fighter.webCooldown = WEB.cooldown; fighter.webId++;
    }
    fighter.pose = fighterPose(fighter);
    moveFighter(fighter, action.bite ? { direction: action.direction } : action, 1 / COMBAT.tickRate, fighter.phase === 'idle');
  }
  if (world.fighters.every(isAttached)) resolveContact(world.fighters, previous.map(fighter => fighter.x));
  faceOpponent(world);
  world.fighters.forEach((fighter, index) => { fighter.distanceTravelled += Math.abs(fighter.x - previous[index].x); });
  for (let index = 0; index < 2; index++) {
    const fighter = world.fighters[index];
    if (fighter.phase === 'webrelease' && fighter.phaseTicks === 0 && world.fighters.every(isAttached)) world.projectiles.push(launchWeb(fighter, world.fighters[1 - index], index));
  }
  const webHits = advanceWebs(world, previous);
  // A net that arrives this tick interrupts windup/active attacks before bite
  // resolution. Ordinary bite trades still use the original shared snapshot.
  for (const hit of webHits) {
    const target = world.fighters[hit.target];
    if (target.hp <= 0 || target.phase === 'ko') continue;
    target.velocity = 0; target.dashRemaining = 0;
    enter(target, 'webstun'); target.pose = fighterPose(target);
  }
  // Gather against one snapshot before applying cancellations or health changes.
  const hits = [];
  for (let index = 0; index < 2; index++) {
    const fighter = world.fighters[index];
    if (fighter.phase !== 'active' || fighter.attackHit || !world.fighters.every(isAttached) || !previous.every(f => f.attached)) continue;
    const contact = biteContact(fighter, world.fighters[1 - index], previous[index], previous[1 - index]);
    if (contact) hits.push({ type: 'hit', source: index, target: 1 - index, damage: COMBAT.damage, attackId: fighter.attackId, contact });
  }
  if (hits.length) {
    const t = Math.min(...hits.map(hit => hit.contact.t));
    world.fighters.forEach((fighter, index) => {
      fighter.x = previous[index].x + (fighter.x - previous[index].x) * t;
      fighter.pose = mixPose(previous[index].pose, fighter.pose, t);
    });
    world.hitstop = COMBAT.hitstop; world.impact = hits;
  }
  for (const hit of hits) {
    world.fighters[hit.source].attackHit = true; world.fighters[hit.source].pose = hit.contact.pose;
    const target = world.fighters[hit.target];
    target.hp = Math.max(0, target.hp - hit.damage);
    world.recoil[hit.target] -= target.forward * COMBAT.knockback;
    target.velocity = 0; target.dashRemaining = 0; target.hitTick = world.tick;
    enter(target, target.hp ? 'hitstun' : 'ko');
  }
  world.events = [...webHits, ...hits];
  const [player, opponent] = world.fighters;
  if (!player.hp || !opponent.hp) {
    world.projectiles = [];
    world.status = 'ended';
    world.winner = !player.hp && !opponent.hp ? 'draw' : player.hp ? 'player' : 'opponent';
    world.fighters.forEach(fighter => { fighter.velocity = 0; fighter.dashRemaining = 0; });
  }
  for (const fighter of world.fighters) if (!['idle', 'ko'].includes(fighter.phase)) fighter.phaseTicks++;
  return world;
}
