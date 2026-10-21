import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSpiderRig } from '../src/spider-rig.js';
import { createWorld, stepWorld, COMBAT } from '../src/combat.js';
import { RULES } from '../src/movement.js';
import { worldFang } from '../src/bite-profile.js';
import { createRuntime, setReady, queueAction, frameRuntime, pauseRuntime, restartRuntime } from '../src/runtime.js';

const file = await readFile(new URL('../public/models/spider.glb', import.meta.url));
const { scene: source } = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
source.updateMatrixWorld(true);
const prosoma = source.getObjectByName('Prosoma_Cephalothorax');
const rigs = [createSpiderRig(source, 0), createSpiderRig(source, 1)];
function render(world) { rigs.forEach((rig, index) => { rig.update(world.fighters[index].x, world.fighters[index]); rig.root.updateMatrixWorld(true); }); }
function actualTip(index, side) {
  const mesh = rigs[index].mouth.getObjectByName(`Fang_${side < 0 ? 'L' : 'R'}_tip`);
  const positions = mesh.geometry.attributes.position;
  // Independently identify the original apex: the unique innermost X vertex,
  // distinct from its four-vertex proximal ring. No profile coordinates used.
  let vertex = 0;
  for (let i = 1; i < positions.count; i++) if ((positions.getX(i) - positions.getX(vertex)) * -side > 0) vertex = i;
  return new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld);
}
function visibleDistance(point, target) {
  const geometry = prosoma.geometry, indices = geometry.index, positions = geometry.attributes.position;
  let distance = Infinity;
  for (let i = 0; i < indices.count; i += 3) {
    const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + offset)).applyMatrix4(prosoma.matrixWorld).applyMatrix4(rigs[target].inverted.matrixWorld));
    const nearest = new THREE.Triangle(...vertices).closestPointToPoint(point, new THREE.Vector3());
    distance = Math.min(distance, nearest.distanceTo(point));
  }
  return distance;
}
function closeWorld(gap = 0, reversed = false) { const world = createWorld(); world.fighters[0].x = 0; world.fighters[1].x = (reversed ? -1 : 1) * (RULES.separation + gap); return world; }
function assertVisibleContact(world) {
  render(world);
  for (const hit of world.impact) {
    const actual = actualTip(hit.source, hit.contact.side);
    assert.ok(visibleDistance(actual, hit.target) < 1e-6, 'rendered original fang apex touches an actual visible prosoma triangle');
    assert.ok(actual.distanceTo(new THREE.Vector3(...hit.contact.point)) < 1e-6);
  }
}

test('rendered original fang apex follows the shared hinge arc on every windup and active tick, both faces', () => {
  const world = closeWorld(0.2);
  for (let tick = 0; tick < 24; tick++) {
    stepWorld(world, tick ? [{}, {}] : [{ bite: true }, { bite: true }]); render(world);
    for (const index of [0, 1]) for (const side of [-1, 1]) {
      const fighter = world.fighters[index];
      assert.ok(actualTip(index, side).distanceTo(new THREE.Vector3(...worldFang(fighter, fighter.pose, side))) < 1e-7);
      assert.equal(rigs[index].mouth.position.length(), 0);
      for (const joint of rigs[index].jaws) {
        assert.equal(joint.jaw.rotation.x, fighter.pose.jaw);
        assert.equal(joint.fang.rotation.x, fighter.pose.fang);
      }
    }
  }
});
test('physical contact at the calibrated range touches GLB triangles; just outside and the old range whiff', () => {
  for (const reversed of [false, true]) for (const attacker of [0, 1]) for (const gap of [0, 0.01, COMBAT.reach - 1e-6, COMBAT.reach, COMBAT.reach + 1e-5, 0.45]) {
    const world = closeWorld(gap, reversed), actions = [{}, {}]; actions[attacker] = { bite: true };
    stepWorld(world, actions);
    while (!world.impact && world.tick < 25) stepWorld(world);
    const expected = gap <= COMBAT.reach;
    assert.equal(world.fighters[1 - attacker].hp, expected ? 80 : 100, `${attacker}: gap ${gap}`);
    if (expected) assertVisibleContact(world);
  }
  const world = closeWorld(); render(world);
  const left = new THREE.Box3().setFromObject(rigs[0].body), right = new THREE.Box3().setFromObject(rigs[1].body);
  assert.ok(left.max.x < right.min.x, 'all non-mouth body meshes remain separated at minimum collision spacing');
});
test('the first displayed damage frame retains real fang contact even with six-tick catch-up; pause/reset clear it', () => {
  const runtime = createRuntime(); runtime.world = closeWorld(0.01); setReady(runtime, true);
  frameRuntime(runtime, 0); queueAction(runtime, 0, 'bite', 1);
  for (const time of [100, 200, 300, 400]) frameRuntime(runtime, time);
  assert.equal(runtime.world.fighters[1].hp, 80);
  assert.ok(runtime.world.hitstop > 0); assertVisibleContact(runtime.world);
  const frozen = structuredClone(runtime.world); pauseRuntime(runtime, true);
  frameRuntime(runtime, 10000); assert.deepEqual(runtime.world, frozen);
  restartRuntime(runtime); assert.equal(runtime.world.hitstop, 0); assert.equal(runtime.world.impact, null);
  assert.deepEqual(runtime.world.recoil, [0, 0]);
});
test('trades and lethal contact remain visible, with recoil deferred until six subsequent fixed ticks', () => {
  for (const reversed of [false, true]) for (const lethal of [false, true]) {
    const world = closeWorld(0.01, reversed); if (lethal) world.fighters.forEach(f => { f.hp = 20; });
    stepWorld(world, [{ bite: true }, { bite: true }]);
    while (!world.impact && world.tick < 25) stepWorld(world);
    assert.equal(world.impact.length, 2); assertVisibleContact(world);
    const positions = world.fighters.map(f => f.x);
    for (let tick = 0; tick < 5; tick++) { stepWorld(world); assert.deepEqual(world.fighters.map(f => f.x), positions); assertVisibleContact(world); }
    stepWorld(world);
    if (lethal) { assert.equal(world.winner, 'draw'); assertVisibleContact(world); }
    else { assert.equal(world.hitstop, 0); assert.ok((world.fighters[0].x - positions[0]) * (reversed ? 1 : -1) > 0 && (world.fighters[1].x - positions[1]) * (reversed ? -1 : 1) > 0); }
  }
});
