import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWorld, stepWorld } from '../src/combat.js';
import {
  createRuntime,
  setReady,
  frameRuntime,
  queueAction,
  queueDirection,
  pauseRuntime,
  restartRuntime,
} from '../src/runtime.js';
import { IDLE, idlePose } from '../src/idle-pose.js';
import { ATTACHMENT, createSpiderRig, inspectRig } from '../src/spider-rig.js';
import { RULES } from '../src/movement.js';

const wait = (world, ticks) => {
  for (let i = 0; i < ticks; i++) stepWorld(world);
};

test('three quiet seconds per fighter precede an eased bounce; held movement and rejected attempts reset it', () => {
  const world = createWorld(),
    [player, opponent] = world.fighters;
  wait(world, IDLE.delay);
  assert.equal(player.idleBounce.blend, 0);
  wait(world, IDLE.enter + 1);
  assert.equal(player.idleBounce.blend, 1);
  assert.ok(idlePose(player).lift > 0);
  player.cooldown = 1;
  stepWorld(world, [{ dash: true }, {}]);
  assert.equal(player.dashRemaining, 0, 'cooldown rejects the attempt');
  assert.equal(player.idleBounce.quietTicks, 0);
  assert.ok(player.idleBounce.blend > 0 && player.idleBounce.blend < 1, 'rejected input eases out');
  assert.equal(opponent.idleBounce.blend, 1, 'inactivity belongs to each fighter');
  player.x = -RULES.limit;
  for (let i = 0; i < IDLE.delay + 20; i++) stepWorld(world, [{ direction: -1 }, {}]);
  assert.equal(player.idleBounce.quietTicks, 0, 'holding into the boundary remains input');
  assert.equal(player.idleBounce.blend, 0);
  stepWorld(world, [{ bite: true }, {}]);
  assert.ok(
    world.fighters.every((f) => f.idleBounce.blend === 0),
    'attacker and defender return to calibrated geometry',
  );
});

test('neutral polling and no-action AI rest; queued releases and attempts count, and pause/restart/menu remain deterministic', () => {
  const results = [30, 60, 144].map((hz) => {
    const runtime = createRuntime({
      decideOpponent: () => ({ direction: 0, bite: false, dash: false }),
    });
    frameRuntime(runtime, 0);
    frameRuntime(runtime, 5000);
    assert.equal(
      runtime.world.fighters[0].idleBounce.quietTicks,
      0,
      'unready/menu clock is stopped',
    );
    setReady(runtime, true);
    frameRuntime(runtime, 0);
    for (let frame = 1; frame <= hz * 4; frame++) frameRuntime(runtime, (frame * 1000) / hz);
    assert.ok(runtime.world.fighters.every((f) => f.idleBounce.blend === 1));
    return runtime;
  });
  assert.deepEqual(results[0].world, results[1].world);
  assert.deepEqual(results[1].world, results[2].world);
  const runtime = results[0],
    frozen = structuredClone(runtime.world);
  pauseRuntime(runtime, true);
  frameRuntime(runtime, 20000);
  assert.deepEqual(runtime.world, frozen);
  pauseRuntime(runtime, false);
  frameRuntime(runtime, 21000);
  queueDirection(runtime, 0, 0, 21001);
  frameRuntime(runtime, 21017);
  assert.equal(runtime.world.fighters[0].idleBounce.quietTicks, 0, 'release event counts once');
  runtime.world.fighters[0].webCooldown = 60;
  queueAction(runtime, 0, 'shoot', 21018);
  frameRuntime(runtime, 21034);
  assert.equal(runtime.world.fighters[0].idleBounce.quietTicks, 0, 'blocked action still counts');
  restartRuntime(runtime);
  assert.ok(
    runtime.world.fighters.every((f) => f.idleBounce.blend === 0 && f.idleBounce.quietTicks === 0),
  );
});

test('loaded GLB lightly bobs upside down with all eight toes planted, pure repeat renders, and exact exit restoration', async () => {
  const file = await readFile(new URL('../public/models/spider.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    '',
  );
  for (const forward of [-1, 1]) {
    const world = createWorld(),
      fighter = world.fighters[0],
      rig = createSpiderRig(scene, 0);
    fighter.forward = forward;
    world.fighters[1].x = fighter.x + forward * 3;
    rig.update(fighter.x, fighter);
    const neutral = inspectRig(rig).bodyBounds;
    Object.assign(fighter.idleBounce, { quietTicks: 200, blend: 1, animationTicks: 0 });
    rig.update(fighter.x, fighter);
    const planted = inspectRig(rig).feet;
    for (const tick of [15, 30, 45, 60, 75, 90]) {
      fighter.idleBounce.animationTicks = tick;
      const frozen = structuredClone(fighter);
      rig.update(fighter.x, fighter);
      const sample = inspectRig(rig);
      assert.equal(rig.inverted.rotation.z, Math.PI);
      assert.deepEqual(rig.root.position.toArray(), [fighter.x, 0, 0]);
      assert.ok(
        sample.feet.every(
          (foot, index) =>
            new THREE.Vector3(...foot.point).distanceTo(
              new THREE.Vector3(...planted[index].point),
            ) < 1e-7,
        ),
        'distal contacts stay fixed to Float32 vertex precision',
      );
      assert.ok(sample.maxStanceError < ATTACHMENT.tolerance);
      assert.ok(sample.feet.every((foot) => foot.stance));
      assert.ok(
        Math.abs(sample.bodyBounds.min[1] - neutral.min[1]) <=
          IDLE.amplitude * ATTACHMENT.scale + 1e-8,
      );
      if (tick === 45)
        assert.ok(
          Math.abs(sample.bodyBounds.min[1] - neutral.min[1] + IDLE.amplitude * ATTACHMENT.scale) <
            1e-8,
        );
      rig.update(fighter.x, fighter);
      assert.deepEqual(inspectRig(rig), sample);
      assert.deepEqual(fighter, frozen, 'rendering does not mutate simulation');
    }
    stepWorld(world, [{ bite: true }, {}]);
    rig.update(fighter.x, fighter);
    assert.deepEqual(
      inspectRig(rig).bodyBounds,
      neutral,
      'bite immediately restores the exact calibrated body',
    );
    assert.equal(rig.torso.position.y, 0);
    for (const phase of ['hitstun', 'webstun', 'ko']) {
      fighter.phase = phase;
      fighter.idleBounce.blend = 1;
      rig.update(fighter.x, fighter);
      assert.equal(rig.torso.position.y, 0);
    }
    fighter.phase = 'idle';
    fighter.air.mode = 'swinging';
    assert.equal(idlePose(fighter).lift, 0);
    fighter.air.mode = 'attached';
    fighter.dashRemaining = 0.1;
    assert.equal(idlePose(fighter).lift, 0);
  }
});
