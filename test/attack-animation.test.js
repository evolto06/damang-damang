import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSpiderRig, inspectRig, ATTACHMENT } from '../src/spider-rig.js';
import { bitePose, mixPose } from '../src/bite-profile.js';

const file = await readFile(new URL('../public/models/spider.glb', import.meta.url));
const { scene } = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');

test('stationary reference attack rears, snaps in three ticks, and settles with four rear grips', () => {
  for (const forward of [1, -1]) {
    const rig = createSpiderRig(scene, 0), x = 0.4;
    const pose = (phase, ticks) => { rig.update(x, { forward, phase, phaseTicks: ticks }); return inspectRig(rig); };
    const neutral = pose('idle', 0);
    const fullRear = pose('windup', 17), rearContact = rig.legs.map(leg => leg.contact.clone());
    for (const leg of rig.legs.filter(leg => leg.number < 2)) {
      const idle = neutral.feet.find(foot => foot.name === leg.name).point;
      const reared = fullRear.feet.find(foot => foot.name === leg.name).point;
      assert.ok(idle[1] - reared[1] > 0.35, 'pronounced sweep away from twig');
    }
    const fullStrike = pose('active', 2);
    for (const leg of rig.legs.filter(leg => leg.number < 2)) {
      const original = rearContact[rig.legs.indexOf(leg)];
      assert.ok(leg.contact.z - original.z > 1.1, 'fast forward snap');
      assert.ok(original.y - leg.contact.y > 1.5, 'snap lowers forelegs toward twig');
    }
    assert.deepEqual(fullStrike.bodyBounds, neutral.bodyBounds);
    const phases = [['windup', 0], ['windup', 8], ['windup', 17], ['active', 0], ['active', 1], ['active', 5], ['recovery', 0], ['recovery', 10]];
    for (const [phase, ticks] of phases) {
      const result = pose(phase, ticks);
      const grips = result.feet.filter(foot => /[34]$/.test(foot.name));
      assert.ok(grips.every(foot => foot.stance && foot.radialError < ATTACHMENT.tolerance));
      assert.deepEqual(grips, fullRear.feet.filter(foot => /[34]$/.test(foot.name)), 'rear grip stays fixed');
      for (const leg of rig.legs) {
        const positions = leg.mesh.geometry.attributes.position;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        for (let i = 0; i < positions.count; i += 3) {
          a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
          const area = b.sub(a).cross(c.sub(a)).lengthSq();
          assert.ok(Number.isFinite(area) && area > 1e-15, 'original leg triangles remain finite and nondegenerate');
        }
      }
    }
    assert.deepEqual(pose('recovery', 20).feet, neutral.feet, 'settles exactly to neutral');
    for (const phase of ['hitstun', 'ko', 'idle']) assert.deepEqual(pose(phase, 0).feet, neutral.feet, 'interruption/reset restores gait');
    assert.ok(rig.palps.every(palp => palp.group.rotation.x === 0 && palp.group.rotation.y === 0));
  }
});

test('impact interpolation carries the leg animation with the real fang pose', () => {
  const previous = bitePose('windup', 17), next = bitePose('active', 0);
  const frozen = mixPose(previous, next, 0.4), rig = createSpiderRig(scene, 0);
  rig.update(0, { phase: 'active', pose: frozen });
  const feet = inspectRig(rig).feet;
  rig.update(0, { phase: 'hitstun', pose: frozen });
  assert.deepEqual(inspectRig(rig).feet, feet, 'hitstop cannot jump animation based on the new phase');
  assert.equal(rig.palps[0].group.rotation.x, -0.38 * frozen.rear + 0.2 * frozen.strike);
});
