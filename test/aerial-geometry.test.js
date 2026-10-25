import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWorld, stepWorld } from '../src/combat.js';
import { createSpiderRig } from '../src/spider-rig.js';
import { createHeldStick } from '../src/scene.js';
import { AIR, silkEndpoints } from '../src/aerial.js';
import { RULES } from '../src/movement.js';
import { createSilkLine } from '../src/silk.js';
import { fitPlayCamera } from '../src/camera.js';

const file = await readFile(new URL('../public/models/spider.glb', import.meta.url));
const { scene: source } = await new GLTFLoader().parseAsync(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  '',
);
source.updateMatrixWorld(true);
function distanceToMesh(point, mesh, matrix = mesh.matrixWorld) {
  const p = mesh.geometry.attributes.position,
    indices = mesh.geometry.index;
  let minimum = Infinity;
  for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
    const vertices = [0, 1, 2].map((j) =>
      new THREE.Vector3()
        .fromBufferAttribute(p, indices ? indices.getX(i + j) : i + j)
        .applyMatrix4(matrix),
    );
    minimum = Math.min(
      minimum,
      new THREE.Triangle(...vertices)
        .closestPointToPoint(point, new THREE.Vector3())
        .distanceTo(point),
    );
  }
  return minimum;
}
test('visible silk tracks the original spinneret cap and the actual tapered twig surface', () => {
  const scene = new THREE.Scene(),
    stick = createHeldStick(scene),
    rig = createSpiderRig(source, 0);
  stick.add(rig.root);
  const silk = createSilkLine(stick);
  silk.setResolution(844, 390);
  const world = createWorld();
  world.fighters[0].x = -RULES.limit;
  stepWorld(world, [{ drop: true }, {}]);
  for (let i = 0; i < 30; i++) stepWorld(world);
  stepWorld(world, [{ web: true }, {}]);
  for (let i = 0; i < 10; i++) stepWorld(world);
  const fighter = world.fighters[0];
  rig.update(fighter.x, fighter);
  scene.updateMatrixWorld(true);
  silk.update(rig, fighter);
  const expected = silkEndpoints(fighter),
    positions = silk.line.geometry.attributes.position;
  assert.ok(silk.line.visible);
  assert.ok(
    new THREE.Vector3()
      .fromBufferAttribute(positions, 0)
      .distanceTo(new THREE.Vector3(...expected.origin)) < 1e-6,
  );
  assert.ok(
    new THREE.Vector3()
      .fromBufferAttribute(positions, 1)
      .distanceTo(new THREE.Vector3(...expected.anchor)) < 1e-6,
  );
  const spinneret = source.getObjectByName('Spinneret_pair2_L');
  assert.ok(
    distanceToMesh(new THREE.Vector3(...AIR.outlet), spinneret, spinneret.matrixWorld) < 1e-7,
  );
  assert.ok(
    distanceToMesh(new THREE.Vector3(...expected.anchor).add(stick.position), stick.children[0]) <
      1e-7,
  );
  assert.ok(rig.legs.every((leg) => !leg.stance && leg.contact.y < leg.hip.y));
});
test('the complete folded GLB rests above the pavement and restores planted gait after retrieval', () => {
  const scene = new THREE.Scene(),
    stick = createHeldStick(scene),
    rig = createSpiderRig(source, 0);
  stick.add(rig.root);
  const world = createWorld();
  stepWorld(world, [{ drop: true }, {}]);
  for (let i = 0; i < 180; i++) stepWorld(world);
  rig.update(world.fighters[0].x, world.fighters[0]);
  scene.updateMatrixWorld(true);
  const bottom = new THREE.Box3().setFromObject(rig.root).min.y;
  assert.ok(bottom >= -2.4451 && bottom < -2.435);
  assert.ok(rig.legs.every((leg) => !leg.stance));
  stepWorld(world, [{ web: true }, {}]);
  for (let i = 0; i < 500 && world.fighters[0].air.mode !== 'attached'; i++) stepWorld(world);
  rig.update(world.fighters[0].x, world.fighters[0]);
  assert.equal(rig.root.position.y, 0);
  assert.ok(rig.legs.some((leg) => leg.stance));
});
test('actual attached and grounded endpoint silhouettes remain inside HUD-free camera bands', () => {
  const scene = new THREE.Scene(),
    stick = createHeldStick(scene),
    rig = createSpiderRig(source, 0);
  stick.add(rig.root);
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0.15, 18);
  camera.lookAt(0, 0.4, 0);
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [360, 640],
    [844, 390],
  ]) {
    const bands = fitPlayCamera(camera, width, height);
    for (const x of [-RULES.limit, RULES.limit])
      for (const grounded of [false, true]) {
        const world = createWorld(),
          fighter = world.fighters[0];
        fighter.x = x;
        if (grounded) {
          fighter.air.mode = 'grounded';
          fighter.air.y = AIR.groundY;
        }
        rig.update(x, fighter);
        scene.updateMatrixWorld(true);
        rig.root.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const p = mesh.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const point = new THREE.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(mesh.matrixWorld)
              .project(camera);
            const screenY = ((1 - point.y) * height) / 2;
            assert.ok(
              Math.abs(point.x) <= 1 &&
                screenY >= bands.topBand - 1 &&
                screenY <= height - bands.bottomBand + 1,
            );
          }
        });
      }
  }
});
