import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWorld, stepWorld } from '../src/combat.js';
import { createSpiderRig, inspectRig, ATTACHMENT } from '../src/spider-rig.js';
import { createHeldStick } from '../src/scene.js';
import { AIR, isAttached, silkEndpoints } from '../src/aerial.js';
import { fitPlayCamera, followCameraFocus } from '../src/camera.js';

const file = await readFile(new URL('../public/models/spider.glb', import.meta.url));
const { scene: source } = await new GLTFLoader().parseAsync(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  '',
);

test('raised twigs, grip feet, upright roll and visible spinnerets share the simulation frame', () => {
  const scene = new THREE.Scene(),
    parent = createHeldStick(scene, 'terraces');
  const world = createWorld('terraces');
  const rig = createSpiderRig(source, 1),
    fighter = world.fighters[1];
  parent.add(rig.root);
  assert.ok(ATTACHMENT.legReach > 1);
  const twigs = parent.children.filter((child) => child.name === 'Twig');
  assert.deepEqual(
    twigs.map((twig) => twig.position.y),
    [1.25, 0, 1.25],
  );
  rig.update(fighter.x, fighter);
  assert.ok(inspectRig(rig).maxStanceError < 0.02);
  stepWorld(world, [{}, { drop: true }]);
  let lastRoll = Math.PI;
  for (let tick = 0; tick < 150; tick++) {
    stepWorld(world);
    rig.update(fighter.x, fighter);
    scene.updateMatrixWorld(true);
    assert.ok(
      Math.abs(rig.inverted.rotation.z - lastRoll) <= 0.27,
      'flip has no instantaneous jump',
    );
    lastRoll = rig.inverted.rotation.z;
    const actual = parent.worldToLocal(rig.spinneret.getWorldPosition(new THREE.Vector3()));
    assert.ok(actual.distanceTo(new THREE.Vector3(...silkEndpoints(fighter).origin)) < 1e-8);
    const bounds = new THREE.Box3().setFromObject(rig.root, true);
    assert.ok(bounds.min.y > -2.45, `${fighter.air.mode} stays above pavement`);
  }
  assert.equal(lastRoll, 0);
  for (let tick = 0; tick < 500 && !isAttached(fighter); tick++)
    stepWorld(world, [{}, { web: tick === 0 }]);
  assert.ok(isAttached(fighter));
  assert.equal(fighter.air.y, 1.25);
  rig.update(fighter.x, fighter);
  assert.equal(rig.inverted.rotation.z, Math.PI);
  assert.ok(inspectRig(rig).maxStanceError < 0.02);
});

test('the Terraces center stick has its own holder, clear of both endpoint fighter poses', () => {
  const scene = new THREE.Scene(),
    parent = createHeldStick(scene, 'terraces');
  const world = createWorld('terraces'),
    fighter = world.fighters[0];
  const rig = createSpiderRig(source, 0);
  parent.add(rig.root);
  const support = parent.getObjectByName('Middle holder 1');
  assert.ok(support?.visible);
  const hand = new THREE.Box3().setFromObject(support);
  for (const x of world.stage.sticks[1].walk)
    for (const forward of [-1, 1]) {
      fighter.x = x;
      fighter.forward = forward;
      fighter.air.y = 0;
      rig.update(x, fighter);
      const body = new THREE.Box3().setFromObject(rig.root, true);
      assert.ok(body.max.x + 0.1 < hand.min.x, 'the center holder stays beyond the playable rail');
      assert.ok(inspectRig(rig).maxStanceError < 0.02);
    }
  parent.setStage('heights');
  assert.equal(support.visible, false);
  parent.setStage('terraces');
  assert.equal(support.visible, true);
  assert.equal(parent.children.filter((node) => node.name.startsWith('Middle holder')).length, 1);
});

test('raised arena camera keeps the high twig and pavement between HUD bands on all target sizes', () => {
  const world = createWorld('terraces');
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0.15, 18);
  camera.lookAt(0, 0.4, 0);
  const focus = { x: 0, halfSpan: 8 };
  followCameraFocus(focus, world.fighters, world.stage);
  for (const [width, height] of [
    [1366, 768],
    [1024, 600],
    [390, 844],
    [844, 390],
  ]) {
    const bands = fitPlayCamera(camera, width, height, focus);
    for (const y of [AIR.stickY + 1.25 + 0.2, -2.45]) {
      const point = new THREE.Vector3(0, y, 0).project(camera);
      const screenY = ((1 - point.y) * height) / 2;
      assert.ok(screenY >= bands.topBand - 1 && screenY <= height - bands.bottomBand + 1);
    }
  }
});
