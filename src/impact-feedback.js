// Compare health rather than transient events: a render frame may contain six ticks.
export function createImpactFeedback() { return { hp: null, items: [], age: 1, nextId: 0 }; }
export function updateImpactFeedback(state, fighters, delta, { paused = false, reducedMotion = false } = {}) {
  if (!state.hp) state.hp = fighters.map(fighter => fighter.hp);
  if (!paused) {
    state.age += delta;
    state.items.forEach(item => { item.age += delta; });
    fighters.forEach((fighter, index) => {
      const damage = state.hp[index] - fighter.hp;
      if (damage > 0) { state.items.push({ id: state.nextId++, target: index, damage, x: fighter.x, y: fighter.air.y, age: 0 }); state.age = 0; }
    });
    state.items = state.items.filter(item => item.age < 0.8);
  }
  state.hp = fighters.map(fighter => fighter.hp);
  const strength = reducedMotion || state.age >= 0.18 ? 0 : 0.045 * (1 - state.age / 0.18);
  return { items: state.items, shake: { x: Math.sin(state.age * 155) * strength, y: Math.cos(state.age * 130) * strength * 0.65 }, flashes: fighters.map((_, index) => state.items.some(item => item.target === index && item.age < 0.22)) };
}
