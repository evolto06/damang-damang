import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  ATTACHMENT,
  PLAYER_TINTS,
  createSpiderRig,
  inspectRig,
} from "../src/spider-rig.js";
import * as THREE from "three";
import { createHeldStick, STICK } from "../src/scene.js";
import { RULES } from "../src/movement.js";
import { AIR } from "../src/aerial.js";

test("loaded GLB combat poses preserve inverted roots, fixed bodies and rear grips, including after KO reset", async () => {
  const file = await readFile(
    new URL("../public/models/spider.glb", import.meta.url),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    "",
  );
  for (const index of [0, 1]) {
    const rig = createSpiderRig(scene, index);
    for (const x of [-RULES.limit, -1, RULES.opponentX, RULES.limit]) {
      rig.update(x, { phase: "idle", phaseTicks: 0 });
      const neutral = inspectRig(rig);
      let rearedFeet;
      for (const phase of [
        "windup",
        "active",
        "recovery",
        "hitstun",
        "ko",
        "idle",
      ]) {
        rig.update(x, { phase, phaseTicks: 5 });
        const inspection = inspectRig(rig);
        assert.deepEqual(rig.root.position.toArray(), [x, 0, 0]);
        assert.equal(rig.inverted.rotation.z, Math.PI);
        assert.deepEqual(inspection.bodyBounds, neutral.bodyBounds);
        if (["windup", "active", "recovery"].includes(phase)) {
          assert.ok(
            inspection.feet
              .filter((foot) => /[34]$/.test(foot.name))
              .every((foot) => foot.stance),
          );
          assert.ok(
            inspection.feet
              .filter((foot) => /[12]$/.test(foot.name))
              .every((foot) => !foot.stance),
          );
          if (phase === "windup") rearedFeet = inspection.feet;
          if (phase === "active")
            assert.notDeepEqual(
              inspection.feet,
              rearedFeet,
              "stationary attack reaches forward",
            );
        } else assert.deepEqual(inspection.feet, neutral.feet);
        assert.ok(inspection.maxStanceError < ATTACHMENT.tolerance);
      }
      assert.equal(rig.mouth.position.z, 0);
      assert.equal(
        rig.material.color.getHex(),
        new THREE.Color(PLAYER_TINTS[index]).getHex(),
      );
    }
  }
});

test("both travel endpoints keep all spider meshes clear of the holder and feet on the twig", async () => {
  const file = await readFile(
    new URL("../public/models/spider.glb", import.meta.url),
  );
  const { scene: source } = await new GLTFLoader().parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    "",
  );
  const scene = new THREE.Scene(),
    stick = createHeldStick(scene);
  const holder = stick.getObjectByName("Holder");
  function xExtent(object) {
    object.updateWorldMatrix(true, true);
    let min = Infinity,
      max = -Infinity;
    const point = new THREE.Vector3();
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        min = Math.min(min, point.x);
        max = Math.max(max, point.x);
      }
    });
    return { min, max };
  }
  const holderExtent = xExtent(holder);
  for (const [index, x] of [
    [0, -RULES.limit],
    [1, RULES.limit],
  ]) {
    const rig = createSpiderRig(source, index);
    stick.add(rig.root);
    rig.update(x, { phase: "active", phaseTicks: 1 });
    assert.ok(
      xExtent(rig.root).max + 0.2 < holderExtent.min,
      "all-mesh separation from the complete holder",
    );
    const feet = inspectRig(rig).feet;
    assert.ok(
      feet.every(
        (foot) =>
          foot.point[0] >= -STICK.halfLength && foot.point[0] <= STICK.rightEnd,
      ),
    );
    assert.ok(inspectRig(rig).maxStanceError < ATTACHMENT.tolerance);
  }
  // The hand remains near the extended end and the twig spans the wider arena.
  assert.equal(STICK.halfLength, -AIR.stickLeft);
  assert.ok(STICK.gripX > RULES.limit && STICK.gripX < STICK.rightEnd);
});

// Player color and transient effects must never leak into the other fighter or GLB.
test("fighter materials keep distinct identities and isolate KO and stun effects", async () => {
  const file = await readFile(
    new URL("../public/models/spider.glb", import.meta.url),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    "",
  );
  const sourceColors = [];
  scene.traverse((mesh) => {
    if (mesh.isMesh) sourceColors.push(mesh.material.color.getHex());
  });
  const [player, opponent] = [
    createSpiderRig(scene, 0),
    createSpiderRig(scene, 1),
  ];
  assert.notEqual(player.material, opponent.material);
  assert.notEqual(
    player.material.color.getHex(),
    opponent.material.color.getHex(),
  );
  const opponentColor = opponent.material.color.getHex();
  player.update(0, { phase: "ko", phaseTicks: 1 });
  assert.equal(opponent.material.color.getHex(), opponentColor);
  player.update(0, { phase: "webstun", phaseTicks: 1 });
  assert.notEqual(
    player.material.emissive.getHex(),
    opponent.material.emissive.getHex(),
  );
  player.update(0, { phase: "idle", phaseTicks: 0 });
  assert.equal(
    player.material.color.getHex(),
    new THREE.Color(PLAYER_TINTS[0]).getHex(),
  );
  const after = [];
  scene.traverse((mesh) => {
    if (mesh.isMesh) after.push(mesh.material.color.getHex());
  });
  assert.deepEqual(after, sourceColors);
});
