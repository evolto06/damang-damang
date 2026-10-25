// Coordinates share an arena frame; y is the twig height relative to the holder root.
const freezeStage = (value) =>
  Object.freeze({
    ...value,
    start: Object.freeze(value.start),
    sticks: Object.freeze(
      value.sticks.map((stick) =>
        Object.freeze({
          ...stick,
          walk: Object.freeze(stick.walk),
          body: Object.freeze(stick.body),
        }),
      ),
    ),
  });
export const STAGES = Object.freeze({
  single: freezeStage({
    id: 'single',
    name: 'One stick',
    start: [-2.45 * 1.5, 2.45 * 1.5],
    sticks: [{ walk: [-5.65 * 1.5, 5.65 * 1.5], body: [-6.7 * 1.5, 7.7 * 1.5], y: 0 }],
  }),
  twin: freezeStage({
    id: 'twin',
    name: 'Twin sticks',
    start: [-6.75, 6.75],
    sticks: [
      { walk: [-13.5, -0.75], body: [-15, -0.6], y: 0 },
      { walk: [0.75, 13.5], body: [0.6, 15], y: 0 },
    ],
  }),
  heights: freezeStage({
    id: 'heights',
    name: 'Stepped sticks',
    start: [-6.75, 6.75],
    sticks: [
      { walk: [-13.5, -0.75], body: [-15, -0.6], y: -0.9 },
      { walk: [0.75, 13.5], body: [0.6, 15], y: 0.9 },
    ],
  }),
  terraces: freezeStage({
    id: 'terraces',
    name: 'Terraces',
    start: [-6.75, 6.75],
    sticks: [
      { walk: [-13.5, -0.75], body: [-15, -0.6], y: 0 },
      { walk: [0.75, 13.5], body: [0.6, 15], y: 1.25 },
    ],
  }),
});
export const getStage = (value = 'single') =>
  typeof value === 'string'
    ? (STAGES[value] ?? STAGES.single)
    : value?.sticks?.length
      ? value
      : STAGES.single;
const gap = (x, [a, b]) => (x < a ? a - x : x > b ? x - b : 0);
const xOf = (value) => (typeof value === 'number' ? value : value.x);
const yOf = (value) => (typeof value === 'number' ? null : (value.air?.y ?? value.y ?? null));
const distance = (value, stick, key) =>
  gap(xOf(value), stick[key]) ** 2 + (yOf(value) === null ? 0 : (yOf(value) - stick.y) ** 2);
const nearest = (value, key, layout) =>
  getStage(layout).sticks.reduce((best, stick) =>
    distance(value, stick, key) < distance(value, best, key) ? stick : best,
  );
const clamp = (x, [a, b]) => Math.max(a, Math.min(b, x));
export const stickFor = (value, layout) => nearest(value, 'walk', layout);
export const twigAt = (x, layout) => nearest(x, 'body', layout).body;
export const stickAt = (x, layout) => nearest(x, 'walk', layout).walk;
export const stickHeight = (x, layout) => nearest(x, 'walk', layout).y;
// Cast only toward twigs above the outlet. Horizontal distance remains primary
// so a deliberate crossing targets the destination rather than the old rail.
export function silkTarget(x, y, layout) {
  return twigAbove(x, y + 0.049, layout);
}
export const sameStick = (a, b, layout) => stickFor(a, layout) === stickFor(b, layout);
export const clampToStick = (x, ref = x, layout) => clamp(x, stickAt(ref, layout));
export const clampToTwig = (x, ref = x, layout) => clamp(x, nearest(ref, 'body', layout).body);
// A cast must travel upward. In overlapping layouts a lower twig must never
// intercept a spider above it; choose the nearest eligible physical twig.
export function twigAbove(x, y, layout) {
  const candidates = getStage(layout).sticks.filter((stick) => stick.y > y + 0.001);
  return candidates.reduce(
    (best, stick) =>
      !best ||
      gap(x, stick.body) < gap(x, best.body) - 1e-9 ||
      (Math.abs(gap(x, stick.body) - gap(x, best.body)) < 1e-9 && stick.y < best.y)
        ? stick
        : best,
    null,
  );
}
export const span = (layout) => {
  const sticks = getStage(layout).sticks;
  return [
    Math.min(...sticks.map((stick) => stick.walk[0])),
    Math.max(...sticks.map((stick) => stick.walk[1])),
  ];
};
