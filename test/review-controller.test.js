import test from "node:test";
import assert from "node:assert/strict";
import { createControllerInput } from "../src/controller.js";
const context = { started: true, ready: true, focused: true, mode: "pvp" };
const pad = (axes = [0, 0], held = []) => ({
  index: 0,
  id: "test",
  mapping: "standard",
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: held.includes(i),
  })),
});

test("analog controls have a deadzone, obey D-pad priority and require neutral on join", () => {
  const input = createControllerInput();
  input.poll([pad([1, 0])], 0, context);
  assert.deepEqual(input.poll([pad([1, 0])], 1, context).directions, []);
  input.poll([pad()], 2, context);
  assert.deepEqual(input.poll([pad([0.2, 0])], 3, context).directions, []);
  assert.equal(
    input.poll([pad([-0.8, 0])], 4, context).directions[0].value,
    -1,
  );
  assert.equal(
    input.poll([pad([-0.8, 0], [15])], 5, context).directions[0].value,
    1,
  );
  assert.equal(input.poll([pad([0, 0.8])], 6, context).actions[0].kind, "drop");
  assert.deepEqual(input.poll([pad([0, 0.8])], 7, context).actions, []);
});

test("controller menus expose navigation and confirmation without combat or forced restart", () => {
  const input = createControllerInput();
  const menu = { ...context, paused: true, navigateUI: true };
  input.poll([pad()], 0, menu);
  const next = input.poll([pad([0, 0], [13])], 1, menu);
  assert.deepEqual(next.navigation, ["next"]);
  assert.deepEqual(next.actions, []);
  input.poll([pad()], 2, menu);
  const confirm = input.poll([pad([0, 0], [0])], 3, menu);
  assert.deepEqual(confirm.navigation, ["confirm"]);
  assert.equal(confirm.command, null);
  input.poll([pad()], 4, context);
  assert.equal(input.poll([pad([0, 0], [8])], 5, context).command, "restart");
});
