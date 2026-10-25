import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createWorld, stepWorld, COMBAT } from "../src/combat.js";
import { AIR } from "../src/aerial.js";
import { RULES } from "../src/movement.js";
import {
  WEB,
  webPose,
  posedSpinneret,
  launchWeb,
  headCenter,
  webContact,
} from "../src/web-attack.js";
import { bitePose, hurtContains, mixPose, BITE } from "../src/bite-profile.js";
import { createSpiderRig, inspectRig, ATTACHMENT } from "../src/spider-rig.js";
import { createWebEffects } from "../src/web-effects.js";
import {
  createRuntime,
  setReady,
  frameRuntime,
  queueAction,
  pauseRuntime,
  restartRuntime,
} from "../src/runtime.js";
import { createAI, decideAI } from "../src/ai.js";
import { fightFeedback } from "../src/feedback.js";

const tick = (world, count, actions = [{}, {}]) => {
  for (let i = 0; i < count; i++) stepWorld(world, actions);
};
const closeWorld = (forward = 1) => {
  const world = createWorld();
  world.fighters[0].x = 0;
  world.fighters[1].x = forward * RULES.separation;
  return world;
};
const file = await readFile(
  new URL("../public/models/spider.glb", import.meta.url),
);
const { scene } = await new GLTFLoader().parseAsync(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  "",
);

test("web has explicit 20/2/10 phases, a finite travelling projectile, physical hit and exact 40-tick stun", () => {
  for (const forward of [1, -1]) {
    const world = closeWorld(forward),
      [player, target] = world.fighters;
    stepWorld(world, [{ shoot: true, direction: 1, dash: true }, {}]);
    tick(world, WEB.windup - 1);
    assert.equal(player.phase, "webwindup");
    assert.equal(world.projectiles.length, 0);
    stepWorld(world);
    assert.equal(player.phase, "webrelease");
    assert.equal(player.x, 0);
    assert.equal(player.cooldown, 0);
    assert.equal(world.projectiles.length, 1);
    assert.equal(
      target.phase,
      "idle",
      "a distant target is never stunned at cast time",
    );
    assert.deepEqual(world.projectiles[0].origin, posedSpinneret(player));
    assert.ok(
      world.projectiles[0].position[0] * forward >
        world.projectiles[0].origin[0] * forward,
    );
    const origin = [...world.projectiles[0].origin];
    for (let guard = 0; target.phase !== "webstun" && guard < 20; guard++)
      stepWorld(world);
    assert.equal(world.events[0]?.type, "webhit");
    assert.equal(target.phase, "webstun");
    assert.equal(target.phaseTicks, 1);
    assert.equal(world.projectiles.length, 0);
    assert.deepEqual(
      world.fighters.map((f) => f.hp),
      [100, 100],
    );
    assert.ok(
      Math.hypot(
        ...world.events[0].contact.point.map((v, axis) => v - origin[axis]),
      ) > 0.1,
    );
    const x = target.x;
    tick(world, WEB.stun - 1, [
      {},
      {
        bite: true,
        shoot: true,
        dash: true,
        drop: true,
        web: true,
        direction: -forward,
      },
    ]);
    assert.equal(target.phase, "webstun");
    assert.equal(target.phaseTicks, WEB.stun);
    assert.equal(target.x, x);
    assert.equal(target.air.mode, "attached");
    assert.equal(target.attackId, 0);
    assert.equal(target.webId, 0);
    stepWorld(world);
    assert.equal(target.phase, "idle");
  }
});

test("successful stun chains into an unbuffered close-range bite before the target can act in either heading", () => {
  for (const forward of [1, -1]) {
    const world = closeWorld(forward),
      [player, target] = world.fighters;
    stepWorld(world, [{ shoot: true }, {}]);
    while (player.phase !== "idle") stepWorld(world);
    assert.equal(world.tick, WEB.windup + WEB.release + WEB.recovery + 1);
    assert.equal(target.phase, "webstun");
    const stunTicks = target.phaseTicks;
    assert.ok(WEB.stun - stunTicks >= COMBAT.windup + 3);
    stepWorld(world, [
      { bite: true },
      { bite: true, dash: true, drop: true, shoot: true },
    ]);
    for (let guard = 0; target.hp === 100 && guard < 30; guard++)
      stepWorld(world, [{}, { bite: true }]);
    assert.equal(world.events[0]?.type, "hit");
    assert.equal(target.hp, 80);
    assert.equal(player.hp, 100);
    assert.equal(world.tick, 54);
    assert.equal(
      target.attackId,
      0,
      "stun prevents the attempted counterattack",
    );
    assert.equal(player.webId, 1);
  }
});

test("shots miss a dropping target, expire, cannot fire in the air, and cooldown outlasts the complete stun combo", () => {
  const world = createWorld();
  stepWorld(world, [{ shoot: true }, {}]);
  tick(world, WEB.windup);
  assert.equal(world.projectiles.length, 1);
  stepWorld(world, [{}, { drop: true }]);
  tick(world, WEB.lifetime + WEB.windup, [{ shoot: true }, { shoot: true }]);
  assert.equal(world.projectiles.length, 0);
  assert.deepEqual(
    world.fighters.map((f) => f.hp),
    [100, 100],
  );
  assert.equal(world.fighters[0].webId, 1);
  assert.equal(world.fighters[1].webId, 0);
  assert.ok(world.fighters[0].webCooldown > 0);
  const close = closeWorld();
  stepWorld(close, [{ shoot: true }, {}]);
  tick(close, WEB.cooldown - 1, [{ shoot: true }, {}]);
  assert.equal(close.fighters[0].webId, 1);
  assert.equal(close.fighters[0].webCooldown, 1);
  assert.equal(
    close.fighters[1].phase,
    "idle",
    "target has a substantial escape window before another shot",
  );
  stepWorld(close, [{ shoot: true }, {}]);
  assert.equal(close.fighters[0].webId, 2);
});

test("sweep includes target motion and posed height, rejects outside passes and protects KO", () => {
  const world = closeWorld(),
    [source, target] = world.fighters;
  source.pose = { ...bitePose("idle"), ...webPose("webrelease") };
  target.pose = { ...source.pose };
  const center = headCenter(target);
  const shot = launchWeb(source, target, 0);
  shot.previous = [center[0] - 0.5, center[1], center[2]];
  shot.position = [center[0] + 0.5, center[1], center[2]];
  assert.ok(webContact(shot, target, target));
  shot.previous[1] -= 0.4;
  shot.position[1] -= 0.4;
  assert.equal(webContact(shot, target, target), null);
  shot.previous = [...center];
  shot.position = [...center];
  target.hp = 0;
  target.phase = "ko";
  assert.equal(webContact(shot, target, target), null);
  const patch = [
    target.x + 1.4 * BITE.scale * target.forward,
    BITE.offsetY -
      0.85 * BITE.scale -
      WEB.rise * target.pose.webStand * BITE.scale,
    0,
  ];
  assert.equal(
    hurtContains(patch, target),
    true,
    "bite head patch follows the translated torso",
  );
  target.pose = bitePose("idle");
  assert.equal(hurtContains(patch, target), false);
  assert.equal(
    mixPose({ webStand: 0, webCurl: 0 }, { webStand: 1, webCurl: 1 }, 0.4)
      .webStand,
    0.4,
  );
});

test("original mesh legs stand tall and abdomen curls forward, with exact shared visible spinneret in both facings", () => {
  for (const forward of [1, -1]) {
    const rig = createSpiderRig(scene, 0),
      fighter = createWorld().fighters[0];
    fighter.x = 0.4;
    fighter.forward = forward;
    rig.update(fighter.x, fighter);
    const neutral = inspectRig(rig),
      neutralOutlet = new THREE.Vector3();
    rig.spinneret.getWorldPosition(neutralOutlet);
    for (const [phase, phaseTicks] of [
      ["webwindup", 0],
      ["webwindup", 10],
      ["webwindup", 19],
      ["webrelease", 0],
      ["webrecovery", 4],
      ["webrecovery", 9],
    ]) {
      fighter.phase = phase;
      fighter.phaseTicks = phaseTicks;
      fighter.pose = { ...bitePose("idle"), ...webPose(phase, phaseTicks) };
      rig.update(fighter.x, fighter);
      rig.root.updateMatrixWorld(true);
      const outlet = rig.spinneret
        .getWorldPosition(new THREE.Vector3())
        .toArray();
      assert.ok(
        outlet.every(
          (v, axis) => Math.abs(v - posedSpinneret(fighter)[axis]) < 1e-9,
        ),
      );
      const inspection = inspectRig(rig);
      assert.ok(inspection.maxStanceError < ATTACHMENT.tolerance);
      if (phase === "webrelease") {
        assert.ok(
          inspection.bodyBounds.max[1] < neutral.bodyBounds.max[1] - 0.1,
          "inverted torso extends away from twig",
        );
        assert.ok(
          (outlet[0] - neutralOutlet.x) * forward > 0.8,
          "rear spinneret curls toward opponent",
        );
        assert.ok(inspection.feet.every((foot) => foot.stance));
        assert.equal(rig.inverted.rotation.z, Math.PI);
        assert.equal(rig.mouth.position.length(), 0);
      }
      rig.torso.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const box = new THREE.Box3().setFromObject(mesh);
        assert.ok(
          box.max.y < 0,
          "posed torso and abdomen stay beneath the twig",
        );
        assert.ok(Number.isFinite(box.min.y));
      });
    }
    fighter.phase = "idle";
    fighter.pose = bitePose("idle");
    rig.update(fighter.x, fighter);
    assert.deepEqual(inspectRig(rig).bodyBounds, neutral.bodyBounds);
    assert.deepEqual(inspectRig(rig).feet, neutral.feet);
  }
});

test("each intermediate curl sweeps ventrally about its connected hinge and clears the twig in both headings", () => {
  for (const forward of [1, -1]) {
    const rig = createSpiderRig(scene, 0),
      fighter = createWorld().fighters[0];
    fighter.forward = forward;
    const point = new THREE.Vector3();
    const neutralY = -(AIR.outlet[1] - WEB.pivot[1]) * BITE.scale;
    for (const [phase, duration] of [
      ["webwindup", WEB.windup],
      ["webrelease", WEB.release],
      ["webrecovery", WEB.recovery],
    ]) {
      for (let ticks = 0; ticks < duration; ticks += 0.5) {
        fighter.pose = { ...bitePose("idle"), ...webPose(phase, ticks) };
        rig.update(fighter.x, fighter);
        rig.root.updateMatrixWorld(true);
        const outlet = rig.spinneret.getWorldPosition(new THREE.Vector3());
        const hinge = rig.abdomen.getWorldPosition(new THREE.Vector3());
        if (fighter.pose.webCurl > 0) {
          assert.ok(
            outlet.y - hinge.y > neutralY,
            "tail moves toward the native ventral side throughout the arc",
          );
          assert.ok(
            rig.abdomen.rotation.x < 0,
            "inverted rear takes the ventral arc, including intermediate frames",
          );
        }
        assert.ok(
          outlet.distanceTo(new THREE.Vector3(...posedSpinneret(fighter))) <
            1e-9,
        );
        rig.torso.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            point
              .fromBufferAttribute(positions, i)
              .applyMatrix4(mesh.matrixWorld);
            assert.ok(
              point.y < -AIR.stickRadius,
              "actual torso vertices remain below the twig surface at every sampled frame",
            );
          }
        });
        assert.equal(rig.inverted.rotation.z, Math.PI);
        assert.ok(inspectRig(rig).maxStanceError < ATTACHMENT.tolerance);
      }
    }
  }
});

test("K edge is consumed once, world/projectile freeze through pause and hitstop, reset clears, and AI honors stun", () => {
  const runtime = createRuntime();
  setReady(runtime, true);
  frameRuntime(runtime, 0);
  queueAction(runtime, 0, "shoot", 4);
  frameRuntime(runtime, 7);
  assert.equal(runtime.controls[0].inputs.length, 1);
  frameRuntime(runtime, 17);
  assert.equal(runtime.world.fighters[0].webId, 1);
  queueAction(runtime, 0, "shoot", 20);
  for (let i = 2; i <= 25; i++) frameRuntime(runtime, (i * 1000) / 60);
  assert.equal(runtime.world.fighters[0].webId, 1);
  assert.equal(runtime.controls[0].inputs.length, 0);
  assert.equal(runtime.world.projectiles.length, 1);
  const effects = createWebEffects(new THREE.Group()),
    snapshot = structuredClone(runtime.world);
  for (let i = 0; i < 3; i++)
    effects.update(runtime.world, runtime.world.fighters, i / 2);
  assert.deepEqual(runtime.world, snapshot, "render never modifies simulation");
  pauseRuntime(runtime, true);
  frameRuntime(runtime, 5000);
  assert.deepEqual(runtime.world, snapshot);
  pauseRuntime(runtime, false);
  frameRuntime(runtime, 6000);
  const shot = structuredClone(runtime.world.projectiles[0]);
  runtime.world.hitstop = 3;
  tick(runtime.world, 2);
  assert.deepEqual(runtime.world.projectiles[0].position, shot.position);
  assert.equal(runtime.world.projectiles[0].age, shot.age);
  assert.equal(
    runtime.world.fighters[0].webCooldown,
    snapshot.fighters[0].webCooldown,
  );
  restartRuntime(runtime);
  assert.deepEqual(runtime.world.projectiles, []);
  assert.equal(runtime.world.fighters[0].webCooldown, 0);
  const opponent = runtime.world.fighters[1];
  opponent.phase = "webstun";
  assert.deepEqual(decideAI(createAI(), runtime.world), {
    direction: 0,
    bite: false,
    dash: false,
  });
  runtime.world.fighters[0].phase = "webstun";
  const feedback = fightFeedback(runtime);
  assert.ok(Object.values(feedback.actions).every((action) => action.disabled));
  assert.match(feedback.prompt, /Web stunned/);
  const ended = closeWorld();
  ended.fighters[1].hp = 20;
  ended.projectiles.push(launchWeb(ended.fighters[0], ended.fighters[1], 0));
  stepWorld(ended, [{ bite: true }, {}]);
  while (ended.status === "playing") stepWorld(ended);
  assert.deepEqual(ended.projectiles, []);
});

test("timestamped shooting, dropping and a close combo are independent of rendering frequency", () => {
  const outcomes = [30, 60, 144].map((hz) => {
    const runtime = createRuntime();
    runtime.world = closeWorld();
    setReady(runtime, true);
    frameRuntime(runtime, 0);
    const events = [
      [7, "shoot"],
      [40, "shoot"],
      [560, "bite"],
      [1200, "shoot"],
      [1900, "drop"],
      [2100, "shoot"],
      [2200, "web"],
    ];
    let event = 0;
    for (let frame = 1; frame <= hz * 3; frame++) {
      const now = (frame * 1000) / hz;
      while (event < events.length && events[event][0] <= now) {
        queueAction(runtime, 0, events[event][1], events[event][0]);
        event++;
      }
      frameRuntime(runtime, now);
    }
    assert.equal(runtime.world.fighters[1].hp, 80);
    return runtime.world;
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});
