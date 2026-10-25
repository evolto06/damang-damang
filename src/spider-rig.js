import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { STICK } from "./scene.js";
import { BITE, bitePose } from "./bite-profile.js";
import { WEB, webPose } from "./web-attack.js";
import { AIR } from "./aerial.js";
import { RULES } from "./movement.js";
import { hangingPose } from "./hanging-pose.js";

export const PLAYER_TINTS = Object.freeze(["#efc26f", "#a7d9d5"]);

export const ATTACHMENT = Object.freeze({
  scale: BITE.scale,
  offsetY: BITE.offsetY,
  stride: 0.34,
  stance: 0.72,
  tolerance: 0.02,
});

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function footCycle(x, legIndex, side) {
  const offset = legIndex * 0.5 + (side < 0 ? 0 : 0.5);
  const fraction = (((x / ATTACHMENT.stride + offset) % 1) + 1) % 1;
  const stance = fraction < ATTACHMENT.stance;
  const t = clamp(
    (fraction - ATTACHMENT.stance) / (1 - ATTACHMENT.stance),
    0,
    1,
  );
  const smooth = t * t * (3 - 2 * t);
  const relativeX =
    ATTACHMENT.stride *
    (stance
      ? ATTACHMENT.stance / 2 - fraction
      : -ATTACHMENT.stance / 2 + ATTACHMENT.stance * smooth);
  return {
    stance,
    relativeX,
    lift: stance ? 0 : Math.sin(t * Math.PI) * 0.065,
  };
}
// A projected ring center, not a bounding-box corner, defines each segment end.
function segmentAxis(geometry) {
  const p = geometry.attributes.position;
  const center = new THREE.Vector3();
  for (let i = 0; i < p.count; i++)
    center.add(new THREE.Vector3().fromBufferAttribute(p, i));
  center.divideScalar(p.count);
  const covariance = new THREE.Matrix3();
  covariance.elements.fill(0);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).sub(center);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++)
        covariance.elements[col * 3 + row] +=
          v.getComponent(row) * v.getComponent(col);
  }
  let axis = new THREE.Vector3(0.7, 0.5, 0.3).normalize();
  for (let i = 0; i < 24; i++) axis.applyMatrix3(covariance).normalize();
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const d = new THREE.Vector3()
      .fromBufferAttribute(p, i)
      .sub(center)
      .dot(axis);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return { center, axis, length: max - min };
}
function coloredGeometry(mesh) {
  const geometry = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const c = mesh.material.color;
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");
  return geometry;
}
export function createSpiderRig(source, index) {
  source.updateMatrixWorld(true);
  const root = new THREE.Group(),
    facing = new THREE.Group(),
    inverted = new THREE.Group();
  const forward = index ? -1 : 1;
  facing.rotation.y = (forward * Math.PI) / 2;
  inverted.rotation.z = Math.PI;
  inverted.scale.setScalar(ATTACHMENT.scale);
  inverted.position.y = ATTACHMENT.offsetY;
  root.add(facing);
  facing.add(inverted);
  const torso = new THREE.Group();
  inverted.add(torso);
  const abdomen = new THREE.Group();
  abdomen.position.fromArray(WEB.pivot);
  torso.add(abdomen);
  const spinneret = new THREE.Object3D();
  spinneret.position.fromArray(AIR.outlet).sub(abdomen.position);
  abdomen.add(spinneret);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    flatShading: true,
    color: PLAYER_TINTS[index],
  });
  const bodyParts = [],
    abdomenParts = [],
    mouthParts = [],
    legParts = new Map();
  source.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const match = mesh.name.match(/^(?:Leg|Claw)_([LR][1-4])_/);
    const geometry = coloredGeometry(mesh);
    if (match) {
      if (!legParts.has(match[1])) legParts.set(match[1], []);
      legParts.get(match[1]).push({ name: mesh.name, geometry });
    } else if (/^(Chelicera|Fang|Pedipalp|Labium|Maxilla)/.test(mesh.name))
      mouthParts.push({ name: mesh.name, geometry });
    else if (/^(Opisthosoma|Spinneret|Book_lung)/.test(mesh.name))
      abdomenParts.push(geometry);
    else bodyParts.push(geometry);
  });
  const bodyGeometry = mergeGeometries(bodyParts);
  for (const geometry of bodyParts) geometry.dispose();
  const body = new THREE.Mesh(bodyGeometry, material);
  body.castShadow = true;
  torso.add(body);
  const abdomenGeometry = mergeGeometries(abdomenParts);
  for (const geometry of abdomenParts) geometry.dispose();
  abdomenGeometry.translate(...WEB.pivot.map((value) => -value));
  const abdomenMesh = new THREE.Mesh(abdomenGeometry, material);
  abdomenMesh.castShadow = true;
  abdomen.add(abdomenMesh);
  const mouth = new THREE.Group();
  torso.add(mouth);
  const jaws = ["L", "R"].map((side, index) => {
    const mirror = index ? -1 : 1;
    const jawPivot = BITE.jawPivot.map((value, axis) =>
      axis ? value : value * mirror,
    );
    const fangPivot = BITE.fangPivot.map((value, axis) =>
      axis ? value : value * mirror,
    );
    const jaw = new THREE.Group(),
      fang = new THREE.Group();
    jaw.position.fromArray(jawPivot);
    mouth.add(jaw);
    fang.position.fromArray(fangPivot).sub(jaw.position);
    jaw.add(fang);
    return { side, jaw, fang, jawPivot, fangPivot };
  });
  // Keep each original pedipalp rigidly connected at its proximal coxa ring.
  const palps = ["L", "R"].map((side) => {
    const coxa = mouthParts.find(
      (part) => part.name === "Pedipalp_" + side + "_1_Coxa",
    );
    const measure = segmentAxis(coxa.geometry);
    if (measure.axis.z < 0) measure.axis.negate();
    const pivot = measure.center
      .clone()
      .addScaledVector(measure.axis, -measure.length / 2);
    const group = new THREE.Group();
    group.position.copy(pivot);
    mouth.add(group);
    return { side, group, pivot };
  });
  for (const part of mouthParts) {
    const joint = jaws.find(
      (item) =>
        part.name === "Chelicera_" + item.side ||
        part.name.startsWith("Fang_" + item.side + "_"),
    );
    const isFang = part.name.startsWith("Fang_");
    const palp = palps.find((item) =>
      part.name.startsWith("Pedipalp_" + item.side + "_"),
    );
    const parent = joint
      ? isFang
        ? joint.fang
        : joint.jaw
      : palp
        ? palp.group
        : mouth;
    if (palp)
      part.geometry.translate(...palp.pivot.toArray().map((value) => -value));
    if (joint)
      part.geometry.translate(
        ...(isFang ? joint.fangPivot : joint.jawPivot).map((value) => -value),
      );
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.name = part.name;
    mesh.castShadow = true;
    parent.add(mesh);
  }
  const legs = [];
  for (const [name, parts] of legParts) {
    const side = name[0] === "L" ? -1 : 1,
      number = Number(name[1]) - 1;
    const pivot = source.getObjectByName("Gait_" + name);
    const hip = new THREE.Vector3().setFromMatrixPosition(pivot.matrixWorld);
    const ordered = parts
      .filter((p) => p.name.startsWith("Leg_"))
      .sort((a, b) => a.name.localeCompare(b.name));
    let cursor = 0;
    const segments = ordered.map((part) => {
      const measure = segmentAxis(part.geometry);
      // Point the measured axis distally using the next joint, or the source hip.
      if (measure.axis.dot(measure.center.clone().sub(hip)) < 0)
        measure.axis.negate();
      const segment = {
        ...measure,
        start: cursor,
        count: part.geometry.attributes.position.count,
      };
      cursor += segment.count;
      return segment;
    });
    const claws = parts.filter((p) => p.name.startsWith("Claw_"));
    const geometries = [...ordered, ...claws].map((p) => p.geometry);
    const geometry = mergeGeometries(geometries);
    const original = geometry.attributes.position.array.slice();
    const originalNormals = geometry.attributes.normal.array.slice();
    const clawStart = cursor;
    const clawCenter = segments[6].center
      .clone()
      .addScaledVector(segments[6].axis, segments[6].length / 2);
    for (const g of geometries) g.dispose();
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    inverted.add(mesh);
    legs.push({
      name,
      side,
      number,
      hip,
      mesh,
      segments,
      original,
      originalNormals,
      clawStart,
      clawCenter,
      contact: new THREE.Vector3(),
      stance: true,
    });
  }
  const rig = {
    root,
    facing,
    inverted,
    torso,
    abdomen,
    abdomenMesh,
    body,
    mouth,
    jaws,
    palps,
    spinneret,
    material,
    legs,
    forward,
    index,
    update: (x, fighter) => updateSpiderRig(rig, x, fighter),
  };
  updateSpiderRig(rig, index ? RULES.opponentX : RULES.startX);
  return rig;
}
function updateSpiderRig(rig, x, fighter) {
  const forward = fighter?.forward ?? rig.forward;
  const turned = forward !== rig.forward;
  rig.forward = forward;
  rig.facing.rotation.y = (forward * Math.PI) / 2;
  const phase = fighter?.phase ?? "idle";
  const ticks = fighter?.phaseTicks ?? 0;
  rig.material.color.set(phase === "ko" ? "#77736b" : PLAYER_TINTS[rig.index]);
  rig.material.emissive.set(
    phase === "webstun"
      ? "#80c5c9"
      : phase.startsWith("web")
        ? "#23666a"
        : phase === "hitstun"
          ? "#9c2510"
          : phase === "windup" || phase === "active"
            ? "#815012"
            : "#000000",
  );
  rig.material.emissiveIntensity =
    phase === "active" ? 0.65 : phase === "hitstun" ? 0.8 : 0.35;
  const pose = fighter?.pose ?? {
    ...bitePose(phase, ticks),
    ...webPose(phase, ticks),
  };
  const webStand = pose.webStand ?? 0,
    webCurl = pose.webCurl ?? 0;
  rig.torso.position.y = WEB.rise * webStand;
  rig.abdomen.rotation.x = WEB.curl * webCurl;
  for (const joint of rig.jaws) {
    joint.jaw.rotation.x = pose.jaw;
    joint.fang.rotation.x = pose.fang;
  }
  const rear = pose.rear ?? 0,
    strike = pose.strike ?? 0;
  const hang = hangingPose(fighter, forward);
  for (const palp of rig.palps) {
    const side = palp.side === "L" ? -1 : 1;
    const pulse = Math.sin(hang.phase + side * 0.8);
    palp.group.rotation.set(
      -0.38 * rear +
        0.2 * strike +
        hang.motion * (0.18 - 0.12 * pulse - 0.18 * hang.climb * pulse),
      side * (0.22 * rear + hang.motion * (0.12 + 0.06 * pulse)),
      0,
    );
  }
  // Both real joints rotate about their original attachments. The exact same
  // angles and original fang apex drive simulation contact, without sliding
  // the mouth assembly away from the head or disturbing planted feet.
  const air = fighter?.air;
  const airBlend = hang.blend;
  rig.root.position.set(x, air?.y ?? 0, 0);
  // Rotate about the actual source spinneret cap, keeping the physics outlet
  // and visible silk exactly coincident through the whole sway.
  rig.inverted.rotation.set(hang.pitch, 0, Math.PI);
  const outlet = new THREE.Vector3(...AIR.outlet).multiplyScalar(
    ATTACHMENT.scale,
  );
  const neutralOutlet = outlet
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  rig.inverted.position
    .copy(neutralOutlet)
    .sub(outlet.applyQuaternion(rig.inverted.quaternion));
  rig.inverted.position.y += ATTACHMENT.offsetY;
  if (
    !turned &&
    rig.lastX === x &&
    rig.lastAirBlend === airBlend &&
    rig.lastRear === rear &&
    rig.lastStrike === strike &&
    rig.lastWebStand === webStand &&
    rig.lastWebCurl === webCurl &&
    rig.lastHangPhase === hang.phase &&
    rig.lastHangMotion === hang.motion &&
    rig.lastHangClimb === hang.climb &&
    rig.lastHangDrift === hang.drift
  )
    return;
  rig.lastHangPhase = hang.phase;
  rig.lastHangMotion = hang.motion;
  rig.lastHangClimb = hang.climb;
  rig.lastHangDrift = hang.drift;
  rig.lastWebStand = webStand;
  rig.lastWebCurl = webCurl;
  rig.lastX = x;
  rig.lastAirBlend = airBlend;
  rig.lastRear = rear;
  rig.lastStrike = strike;
  const vertex = new THREE.Vector3(),
    vertexNormal = new THREE.Vector3();
  rig.root.position.x = x;
  const scale = ATTACHMENT.scale;
  for (const leg of rig.legs) {
    const cycle = footCycle(x, leg.number, leg.side);
    // The rear two pairs brace on the twig while the front two pairs attack.
    const attacking = rear + strike > 1e-8;
    const braced = (attacking && leg.number >= 2) || webStand > 0;
    const radius = STICK.radius + 0.007 + (braced ? 0 : cycle.lift);
    const contactY = radius * 0.55,
      contactSide = radius * Math.sqrt(1 - 0.55 ** 2);
    const toe = new THREE.Vector3(
      (leg.side * contactSide) / scale,
      -(contactY - ATTACHMENT.offsetY) / scale,
      leg.hip.z +
        [0.7, 0.35, -0.4, -0.9][leg.number] +
        (rig.forward * cycle.relativeX) / scale,
    );
    const h = leg.hip.clone();
    h.y += WEB.rise * webStand;
    const s = leg.side,
      z = toe.z;
    const points = [
      h,
      new THREE.Vector3(h.x + s * 0.23, h.y - 0.025, h.z),
      new THREE.Vector3(s * 1.02, 0.8, h.z * 0.85 + z * 0.15),
      new THREE.Vector3(s * 1.48, -0.02, h.z * 0.3 + z * 0.7),
      new THREE.Vector3(s * 1.42, -0.2, z),
      new THREE.Vector3(s * 0.72, toe.y - 0.17, z),
      new THREE.Vector3(s * 0.43, toe.y - 0.08, z),
      toe,
    ];
    if (webStand > 0) {
      points[2].y += 0.8 * webStand;
      points[2].x += s * 0.18 * webStand;
      points[3].y += 0.45 * webStand;
      points[3].x += s * 0.2 * webStand;
      points[4].y += 0.2 * webStand;
    }
    if (leg.number < 2 && attacking) {
      // Adapt the reference's upright rear-and-snap silhouette to an inverted
      // spider: forelegs sweep away from the twig, spread, then strike forward.
      // Head/body stay fixed so the calibrated physical fang contact is exact.
      const front = leg.number === 0;
      const rearToe = new THREE.Vector3(
        s * (front ? 1.65 : 1.85),
        front ? 2.35 : 1.85,
        h.z + (front ? -0.15 : 0.15),
      );
      const strikeToe = new THREE.Vector3(
        s * (front ? 0.82 : 1.05),
        front ? 0.15 : 0.05,
        h.z + (front ? 1.8 : 1.35),
      );
      const rearPoints = [
        h,
        new THREE.Vector3(h.x + s * 0.23, h.y + 0.05, h.z),
        new THREE.Vector3(s * 1.1, 1.35, h.z - 0.15),
        new THREE.Vector3(s * 1.7, 1.9, h.z - 0.3),
        new THREE.Vector3(s * 1.95, 2.15, rearToe.z - 0.25),
        new THREE.Vector3(s * 1.9, rearToe.y + 0.1, rearToe.z - 0.1),
        new THREE.Vector3(s * 1.75, rearToe.y + 0.05, rearToe.z - 0.04),
        rearToe,
      ];
      const strikePoints = [
        h,
        new THREE.Vector3(h.x + s * 0.23, h.y, h.z + 0.04),
        new THREE.Vector3(s * 1.05, 0.9, h.z + 0.45),
        new THREE.Vector3(s * 1.5, 0.45, h.z + 0.9),
        new THREE.Vector3(s * 1.4, 0.2, strikeToe.z - 0.35),
        new THREE.Vector3(s * 1.12, strikeToe.y - 0.05, strikeToe.z - 0.18),
        new THREE.Vector3(s * 0.98, strikeToe.y - 0.03, strikeToe.z - 0.07),
        strikeToe,
      ];
      for (let joint = 1; joint < points.length; joint++) {
        const neutral = points[joint].clone();
        points[joint]
          .addScaledVector(rearPoints[joint].clone().sub(neutral), rear)
          .addScaledVector(strikePoints[joint].clone().sub(neutral), strike);
      }
    }
    if (airBlend > 0) {
      const folded = [
        h,
        new THREE.Vector3(h.x + s * 0.15, h.y + 0.12, h.z),
        new THREE.Vector3(s * 0.95, 1.4, h.z),
        new THREE.Vector3(s * 1.2, 1.75, h.z),
        new THREE.Vector3(s * 1.1, 1.9, h.z),
        new THREE.Vector3(s * 0.85, 1.9, h.z),
        new THREE.Vector3(s * 0.65, 1.7, h.z),
        new THREE.Vector3(s * 0.55, 1.55, h.z),
      ];
      // Native +Y is dorsal: the persistent Rz(PI) inversion maps it down.
      // Reflect the curl about its original hip so feet reach ventrally toward
      // the twig above, while the abdomen stays upside down through the fall.
      for (let joint = 1; joint < folded.length; joint++)
        folded[joint].y = 2 * h.y - folded[joint].y;
      // Each pair trails the swing; opposite sides take alternating retrieval
      // strokes rather than marching in place or freezing into one curled pose.
      const wave = Math.sin(
        hang.phase + leg.number * 0.9 + (s < 0 ? Math.PI : 0),
      );
      const pull = Math.sin(
        hang.phase * 1.7 + leg.number * 0.65 + (s < 0 ? Math.PI : 0),
      );
      for (let joint = 1; joint < points.length; joint++) {
        const distal = joint / 7;
        folded[joint].x +=
          s * hang.motion * distal * (0.1 * wave + 0.12 * hang.climb * pull);
        folded[joint].y -=
          hang.motion * distal * (0.13 * wave + 0.3 * hang.climb * pull);
        folded[joint].z +=
          hang.motion *
          distal *
          (-0.22 * hang.drift + 0.12 * wave - 0.38 * hang.climb * pull);
        points[joint].lerp(folded[joint], airBlend);
      }
    }
    const positions = leg.mesh.geometry.attributes.position,
      normals = leg.mesh.geometry.attributes.normal;
    for (let j = 0; j < 7; j++) {
      const segment = leg.segments[j],
        a = points[j],
        b = points[j + 1];
      const direction = b.clone().sub(a),
        ratio = direction.length() / segment.length;
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        segment.axis,
        direction.normalize(),
      );
      const center = a.clone().add(b).multiplyScalar(0.5);
      for (let i = segment.start; i < segment.start + segment.count; i++) {
        const v = vertex.fromArray(leg.original, i * 3).sub(segment.center);
        const axial = v.dot(segment.axis);
        v.addScaledVector(segment.axis, axial * (ratio - 1))
          .applyQuaternion(rotation)
          .add(center);
        positions.setXYZ(i, v.x, v.y, v.z);
        const normal = vertexNormal
          .fromArray(leg.originalNormals, i * 3)
          .applyQuaternion(rotation);
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
    }
    // Retain the original three claws together at the new distal tarsus end.
    const posedToe = points[7];
    const final = leg.segments[6],
      targetDirection = posedToe.clone().sub(points[6]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      final.axis,
      targetDirection,
    );
    for (let i = leg.clawStart; i < positions.count; i++) {
      const v = vertex
        .fromArray(leg.original, i * 3)
        .sub(leg.clawCenter)
        .applyQuaternion(q)
        .add(posedToe);
      positions.setXYZ(i, v.x, v.y, v.z);
      const n = vertexNormal
        .fromArray(leg.originalNormals, i * 3)
        .applyQuaternion(q);
      normals.setXYZ(i, n.x, n.y, n.z);
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    leg.contact.copy(posedToe);
    leg.stance =
      airBlend === 0 &&
      (braced || (cycle.stance && !(attacking && leg.number < 2)));
  }
}
export function inspectRig(rig) {
  rig.root.updateMatrixWorld(true);
  const feet = rig.legs.map((leg) => {
    const segment = leg.segments[6],
      positions = leg.mesh.geometry.attributes.position;
    // Measure the actual transformed distal tarsus ring by its axial maximum.
    const a = new THREE.Vector3(),
      direction = new THREE.Vector3();
    let max = -Infinity;
    const center = new THREE.Vector3();
    for (let i = segment.start; i < segment.start + segment.count; i++)
      center.add(a.fromBufferAttribute(positions, i));
    center.divideScalar(segment.count);
    direction.copy(leg.contact).sub(center).normalize();
    for (let i = segment.start; i < segment.start + segment.count; i++)
      max = Math.max(
        max,
        a.fromBufferAttribute(positions, i).sub(center).dot(direction),
      );
    const actual = center
      .clone()
      .addScaledVector(direction, max)
      .applyMatrix4(rig.inverted.matrixWorld);
    return {
      name: leg.name,
      stance: leg.stance,
      point: actual.toArray(),
      radialError: Math.abs(
        Math.hypot(
          actual.y - rig.root.getWorldPosition(new THREE.Vector3()).y,
          actual.z,
        ) - STICK.radius,
      ),
    };
  });
  const bodyBounds = new THREE.Box3().setFromObject(rig.body);
  return {
    forward: rig.forward,
    feet,
    maxStanceError: Math.max(
      0,
      ...feet.filter((f) => f.stance).map((f) => f.radialError),
    ),
    bodyBounds: {
      min: bodyBounds.min.toArray(),
      max: bodyBounds.max.toArray(),
    },
  };
}
