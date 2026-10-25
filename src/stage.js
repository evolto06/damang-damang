// All coordinates use the shared stick frame. Layout belongs to each world.
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
    id: "single",
    name: "One stick",
    start: [-2.45 * 1.5, 2.45 * 1.5],
    sticks: [
      { walk: [-5.65 * 1.5, 5.65 * 1.5], body: [-6.7 * 1.5, 7.7 * 1.5], y: 0 },
    ],
  }),
  twin: freezeStage({
    id: "twin",
    name: "Twin sticks",
    start: [-6.75, 6.75],
    sticks: [
      { walk: [-13.5, -0.75], body: [-15, -0.6], y: 0 },
      { walk: [0.75, 13.5], body: [0.6, 15], y: 0 },
    ],
  }),
});
export const getStage = (value = "single") =>
  typeof value === "string"
    ? (STAGES[value] ?? STAGES.single)
    : (STAGES[value?.id] ?? STAGES.single);
const gap = (x, [a, b]) => (x < a ? a - x : x > b ? x - b : 0);
const nearest = (x, key, layout) =>
  getStage(layout).sticks.reduce((best, stick) =>
    gap(x, stick[key]) < gap(x, best[key]) ? stick : best,
  );
const clamp = (x, [a, b]) => Math.max(a, Math.min(b, x));
export const twigAt = (x, layout) => nearest(x, "body", layout).body;
export const stickAt = (x, layout) => nearest(x, "walk", layout).walk;
export const sameStick = (a, b, layout) =>
  stickAt(a, layout) === stickAt(b, layout);
export const clampToStick = (x, ref = x, layout) =>
  clamp(x, stickAt(ref, layout));
export const clampToTwig = (x, ref = x, layout) =>
  clamp(x, nearest(ref, "body", layout).body);
export const span = (layout) => {
  const sticks = getStage(layout).sticks;
  return [sticks[0].walk[0], sticks.at(-1).walk[1]];
};
