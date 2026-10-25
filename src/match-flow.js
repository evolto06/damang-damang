// First to two wins. Draws replay without awarding either side a point.
export const createSeries = () => ({ wins: [0, 0], round: 1, scored: false, complete: false });
export function scoreRound(series, winner) {
  if (series.scored || series.complete) return false;
  if (!['player', 'opponent', 'draw'].includes(winner)) return false;
  if (winner !== 'draw') series.wins[winner === 'player' ? 0 : 1]++;
  series.scored = true;
  series.complete = series.wins.some(wins => wins >= 2);
  return true;
}
export function nextSeriesRound(series) {
  if (!series.scored || series.complete) return false;
  series.round++; series.scored = false; return true;
}
export const createCoaching = (enabled = true) => ({ step: enabled ? 'move' : 'done' });
export function advanceCoaching(coaching, before, after) {
  if (!coaching || coaching.step === 'done') return;
  if (coaching.step === 'move' && after.distanceTravelled > before.distanceTravelled + 1e-8) coaching.step = 'shoot';
  else if (coaching.step === 'shoot' && after.webId > before.webId) coaching.step = 'bite';
  else if (coaching.step === 'bite' && after.attackId > before.attackId) coaching.step = 'done';
}
export function coachingHint(coaching, keys) {
  return ({ move: { action: 'move', text: `${keys.move} Move along the stick` }, shoot: { action: 'shoot', text: `${keys.shoot} Shoot a stunning web` }, bite: { action: 'bite', text: `${keys.bite} Close in and bite` } })[coaching?.step] ?? null;
}
