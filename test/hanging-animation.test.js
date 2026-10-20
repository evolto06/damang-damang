import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSpiderRig, inspectRig } from '../src/spider-rig.js';
import { AIR, silkEndpoints } from '../src/aerial.js';
import { createWorld, stepWorld } from '../src/combat.js';
import { createSilkLine } from '../src/silk.js';
import { createHeldStick } from '../src/scene.js';

const file = await readFile(new URL('../public/models/spider.glb', import.meta.url));
const { scene: source } = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
const feet = rig => rig.legs.map(leg => leg.contact.toArray());

test('hanging and climbing articulate at rest, remain deterministic, and pivot on the exact silk outlet', () => {
  for (const forward of [1, -1]) {
    const world = createWorld(), fighter = world.fighters[0];
    fighter.forward = forward;
    Object.assign(fighter.air, { mode: 'swinging', y: -1.8, ticks: 24, animationTicks: 70, vx: forward * 3, anchorY: -0.07 });
    const parent = new THREE.Group(), rig = createSpiderRig(source, 0), fresh = createSpiderRig(source, 0), silk = createSilkLine(parent);
    parent.add(rig.root);
    const sample = () => {
      const before = JSON.stringify(fighter);
      rig.update(fighter.x, fighter); silk.update(rig, fighter);
      assert.equal(JSON.stringify(fighter), before, 'rendering does not mutate simulation');
      const expected = new THREE.Vector3(...silkEndpoints(fighter).origin);
      assert.ok(rig.spinneret.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-9);
      assert.ok(new THREE.Vector3().fromBufferAttribute(silk.line.geometry.attributes.position, 0).distanceTo(expected) < 1e-6);
      return { feet: feet(rig), pitch: rig.inverted.rotation.x, palps: rig.palps.map(p => p.group.rotation.toArray()) };
    };
    const hanging = sample();
    assert.ok(Math.abs(hanging.pitch) > 0.05, 'perceptible body lean');
    fighter.air.animationTicks += 9;
    const swayed = sample();
    assert.notDeepEqual(swayed.feet, hanging.feet, 'stationary x still animates');
    assert.notDeepEqual(swayed.palps, hanging.palps);
    fighter.air.mode = 'reeling'; fighter.air.ticks = 20; fighter.air.vy = AIR.reelSpeed;
    const climbing = sample();
    assert.ok(climbing.feet.some((toe, index) => Math.abs(toe[2] - swayed.feet[index][2]) > 0.2), 'retrieval has a distinct pulling stroke');
    assert.deepEqual(sample(), climbing, 'repeated/paused render cannot advance motion');
    fresh.update(fighter.x, fighter);
    assert.deepEqual(feet(fresh), climbing.feet, 'pose is independent of prior render calls');
    assert.equal(fresh.inverted.rotation.x, climbing.pitch);
  }
});

test('sampled full return keeps every original mesh above pavement, clear of the holder, and restores the twig pose', () => {
  const scene = new THREE.Scene(), parent = createHeldStick(scene);
  const holder = new THREE.Box3().setFromObject(parent.getObjectByName('Holder'));
  for (const [index, direction] of [[0, -1], [1, 1]]) {
    const rig = createSpiderRig(source, index); parent.add(rig.root);
    const world = createWorld(), fighter = world.fighters[index];
    fighter.x = index ? 5.65 : -5.65;
    scene.updateMatrixWorld(true);
    const neutral = inspectRig(rig);
    stepWorld(world, index ? [{}, { drop: true }] : [{ drop: true }, {}]);
    for (let tick = 0; tick < 180; tick++) stepWorld(world);
    const modes = new Set();
    for (let tick = 0; tick < 500; tick++) {
      const action = { web: tick === 0, direction: tick < 50 ? -direction : direction };
      stepWorld(world, index ? [{}, action] : [action, {}]);
      rig.update(fighter.x, fighter); modes.add(fighter.air.mode);
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(rig.root, true);
      assert.ok(bounds.min.y >= -2.4451, `floor clearance: ${fighter.air.mode} ${bounds.min.y}`);
      assert.ok(bounds.max.x + 0.1 < holder.min.x, `holder clearance: ${bounds.max.x}`);
      if (fighter.air.mode === 'attached') break;
    }
    assert.ok(['deploying', 'swinging', 'reeling', 'reattaching', 'attached'].every(mode => modes.has(mode)));
    assert.equal(rig.inverted.rotation.x, 0);
    assert.ok(inspectRig(rig).maxStanceError < 0.02);
    assert.equal(rig.inverted.position.y, -0.06);
    assert.equal(inspectRig(rig).bodyBounds.max[1], neutral.bodyBounds.max[1]);
  }
});

test('reattachment eases each leg and palp back to the unchanged attached rig', () => {
  const fighter = createWorld().fighters[0], rig = createSpiderRig(source, 0);
  fighter.x = 0;
  rig.update(0, fighter); const neutral = feet(rig);
  const distance = () => feet(rig).reduce((sum, toe, i) => sum + new THREE.Vector3(...toe).distanceTo(new THREE.Vector3(...neutral[i])), 0);
  Object.assign(fighter.air, { mode: 'reattaching', y: -0.2, animationTicks: 180 });
  let previous = Infinity;
  for (let tick = 0; tick <= AIR.reattachTicks; tick++) {
    fighter.air.ticks = tick; fighter.air.animationTicks++;
    rig.update(0, fighter);
    assert.ok(distance() <= previous + 0.02, 'progressively restores grip'); previous = distance();
  }
  assert.deepEqual(feet(rig), neutral);
  assert.ok(rig.palps.every(palp => palp.group.rotation.x === 0 && palp.group.rotation.y === 0));
});


test('released and retrieving spiders keep dorsal bodies down and ventral feet up in both headings', () => {
  for (const forward of [1, -1]) {
    const fighter = createWorld().fighters[0], rig = createSpiderRig(source, 0);
    fighter.forward = forward;
    for (const mode of ['falling', 'grounded', 'deploying', 'swinging', 'reeling', 'reattaching']) {
      Object.assign(fighter.air, { mode, y: -1.8, ticks: 0, vx: forward * 3, vy: AIR.reelSpeed, anchorY: -0.07 });
      for (let age = 10; age < 100; age += 7) {
        fighter.air.animationTicks = age;
        if (mode !== 'reattaching') fighter.air.ticks = age;
        rig.update(fighter.x, fighter); rig.root.updateMatrixWorld(true);
        const dorsal = new THREE.Vector3(0, 1, 0).transformDirection(rig.inverted.matrixWorld);
        assert.ok(dorsal.y < -0.9, `${mode}: abdomen remains inverted`);
        for (const leg of rig.legs) {
          const hip = leg.hip.clone().applyMatrix4(rig.inverted.matrixWorld);
          const toe = leg.contact.clone().applyMatrix4(rig.inverted.matrixWorld);
          assert.ok(toe.y > hip.y, `${mode} ${leg.name}: foot stays on the upper ventral side`);
        }
      }
    }
  }
});
