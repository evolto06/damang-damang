import * as THREE from "three";
import { AIR } from "./aerial.js";
import { getStage } from "./stage.js";

const RIGHT_GROWTH = AIR.stickRight - 7.7;
const STICK_LIFT = AIR.stickY - 1.4;
export const STICK = Object.freeze({
  y: AIR.stickY,
  radius: AIR.stickRadius,
  halfLength: -AIR.stickLeft,
  rightEnd: AIR.stickRight,
  gripX: 7.28 + RIGHT_GROWTH,
  holderOffset: 1 + RIGHT_GROWTH,
});
const materials = new Map();
const material = (color) => {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.88,
        flatShading: true,
      }),
    );
  return materials.get(color);
};
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
function box(parent, color, position, scale) {
  const mesh = new THREE.Mesh(boxGeometry, material(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function ellipsoid(parent, color, position, scale) {
  const mesh = new THREE.Mesh(sphereGeometry, material(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}
function link(parent, color, a, b, radiusA, radiusB = radiusA) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(
    radiusA === radiusB
      ? cylinderGeometry
      : new THREE.CylinderGeometry(radiusB, radiusA, 1, 8),
    material(color),
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    end.clone().sub(start).normalize(),
  );
  mesh.scale.set(
    radiusA === radiusB ? radiusA : 1,
    start.distanceTo(end),
    radiusA === radiusB ? radiusA : 1,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function sign(parent, text, subline, position, width, height, background, ink) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, 768, 256);
  context.strokeStyle = ink;
  context.lineWidth = 7;
  context.strokeRect(13, 13, 742, 230);
  context.fillStyle = ink;
  context.textAlign = "center";
  context.font = "bold 65px sans-serif";
  context.fillText(text, 384, 114, 710);
  context.font = "27px sans-serif";
  context.fillText(subline, 384, 185, 690);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  mesh.position.set(...position);
  parent.add(mesh);
}
export function createStreet(scene) {
  scene.background = new THREE.Color("#d6d7cc");
  scene.fog = new THREE.Fog("#d6d7cc", 18, 46);
  scene.add(new THREE.HemisphereLight("#fff4dd", "#697c80", 2.5));
  const sun = new THREE.DirectionalLight("#fff0d6", 2.5);
  sun.position.set(-6, 11, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -11,
    right: 11,
    top: 7,
    bottom: -7,
    near: 0.1,
    far: 32,
  });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const street = new THREE.Group();
  scene.add(street);
  box(street, "#aaa59a", [0, -2.6, -2], [60, 0.2, 34]);
  // Road, open drainage channel and raised concrete threshold.
  box(street, "#bcb7aa", [0, -2.47, 1.7], [42, 0.05, 13]);
  box(street, "#666e69", [0, -2.42, -4.7], [34, 0.1, 0.5]);
  box(street, "#a8a79a", [0, -2.26, -5.35], [34, 0.38, 0.75]);
  for (let x = -15; x < 16; x += 3.6)
    box(street, "#999a90", [x, -2.43, 1], [0.025, 0.012, 11]);
  // Two quiet frontages sit behind the fighter silhouettes.
  box(street, "#acbaad", [-5.5, 0.4, -7.4], [11, 5.3, 1.8]);
  box(street, "#c6b7a0", [6.8, 0.3, -8.0], [12.6, 5.1, 2.2]);
  // Quiet side houses continue behind the wider arenas; inset trim and awnings
  // give the street depth without adding detail at the fighters' height.
  for (const [x, color] of [
    [-18, "#abb5aa"],
    [19, "#c3b29b"],
  ]) {
    box(street, color, [x, 0.2, -9], [12, 5.3, 2]);
    box(street, "#7c8980", [x, 2.9, -8.6], [12.3, 0.2, 3]);
    box(street, "#637c78", [x - 1.4, -0.5, -7.92], [1.5, 3.2, 0.1]);
    box(street, "#738c84", [x + 2, 0.2, -7.92], [2.6, 1.8, 0.1]);
  }
  for (const [x, z, width] of [
    [-7.9, -6.28, 2.2],
    [-4.2, -6.28, 3],
    [4.5, -6.7, 4.8],
  ]) {
    box(street, "#d0c6ad", [x, 1.15, z], [width, 0.11, 0.2]);
    box(street, "#8c8e7c", [x - width / 2, -0.1, z], [0.1, 2.5, 0.2]);
    box(street, "#8c8e7c", [x + width / 2, -0.1, z], [0.1, 2.5, 0.2]);
  }
  box(street, "#929f94", [-5.5, -1.65, -6.46], [11, 1.15, 0.04]);
  box(street, "#b8aa94", [6.8, -1.65, -6.86], [12.6, 1.15, 0.04]);
  // Corrugated roof fascia: restrained ribs instead of a texture.
  box(street, "#747e7b", [-5.5, 3.1, -6.9], [11.5, 0.18, 3.1]).rotation.x =
    0.09;
  box(street, "#82766b", [6.8, 2.9, -7.3], [13, 0.18, 3.8]).rotation.x = 0.08;
  const ribs = new THREE.InstancedMesh(boxGeometry, material("#92958a"), 46);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 46; i++) {
    matrix.makeScale(0.035, 0.055, 2.7);
    matrix.setPosition(-11 + i * 0.54, 3.23, -6.9);
    ribs.setMatrixAt(i, matrix);
  }
  street.add(ribs);
  box(street, "#6d807d", [-7.9, 0, -6.43], [2, 2.5, 0.12]);
  box(street, "#677a78", [-4.2, 0, -6.43], [2.8, 1.9, 0.12]);
  const bars = new THREE.InstancedMesh(boxGeometry, material("#a5aaa0"), 13);
  for (let i = 0; i < 13; i++) {
    matrix.makeScale(0.045, i < 5 ? 2.4 : 1.8, 0.06);
    matrix.setPosition(
      i < 5 ? -8.7 + i * 0.4 : -5.5 + (i - 5) * 0.37,
      0,
      -6.31,
    );
    bars.setMatrixAt(i, matrix);
  }
  street.add(bars);
  // Shop opening and simple counter with a few stock shapes.
  box(street, "#657572", [4.5, -0.15, -6.87], [4.5, 2.8, 0.1]);
  box(street, "#9a8e76", [4.5, -1.2, -6.5], [4.8, 0.16, 0.75]);
  box(street, "#c9b897", [4.5, -1.75, -6.6], [4.6, 0.9, 0.18]);
  for (let i = 0; i < 8; i++) {
    const awning = box(
      street,
      i % 2 ? "#b6b59c" : "#6d8b7e",
      [2.3 + i * 0.63, 1.24, -5.95],
      [0.63, 0.08, 1.6],
    );
    awning.rotation.x = 0.15;
  }
  for (let i = 0; i < 6; i++)
    box(
      street,
      i % 2 ? "#c9bd8c" : "#b78e74",
      [2.8 + i * 0.65, -0.77, -6.67],
      [0.24, 0.68, 0.24],
    );
  box(street, "#778781", [10.2, -0.5, -6.86], [2.3, 3.4, 0.13]);
  sign(
    street,
    "Tindahan ni Nena",
    "BIGAS  •  MERYENDA  •  PALAMIG",
    [4.5, 2.0, -6.7],
    5,
    1.22,
    "#e0d7ad",
    "#536960",
  );
  sign(
    street,
    "BARANGAY",
    "PAALALA: PANATILIHING MALINIS",
    [-1.1, 1.15, -6.32],
    2.1,
    0.78,
    "#c6d1c3",
    "#596e66",
  );
  for (const [x, z] of [
    [-10.2, -5.8],
    [8.3, -6.1],
  ]) {
    link(street, "#a08166", [x, -2.2, z], [x, -1.5, z], 0.35, 0.43);
    for (let i = 0; i < 3; i++)
      ellipsoid(
        street,
        "#7b947b",
        [x + (i - 1) * 0.18, -1.13 + (i % 2) * 0.3, z],
        [0.28, 0.6, 0.22],
      );
  }
  for (const x of [-12.6, 13.6])
    link(street, "#929587", [x, -2.4, -7], [x, 8, -7], 0.12);
  for (let i = 0; i < 3; i++) {
    const points = [];
    for (let j = 0; j <= 24; j++) {
      const u = j / 24;
      points.push(
        new THREE.Vector3(
          -14 + u * 29,
          6.6 + i * 0.28 - Math.sin(u * Math.PI) * 1.5,
          -7.2 - i * 0.3,
        ),
      );
    }
    street.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: "#737f79" }),
      ),
    );
  }
  return street;
}
export function createHeldStick(scene, stage = "single") {
  const root = new THREE.Group();
  root.position.y = STICK.y;
  scene.add(root);
  const geometryNodes = [];
  function drawTwigs(layout) {
    for (const node of geometryNodes) {
      root.remove(node);
      node.geometry?.dispose();
    }
    geometryNodes.length = 0;
    for (const {
      body: [left, right],
      y,
    } of layout.sticks) {
      const twig = new THREE.Mesh(
        new THREE.CylinderGeometry(
          AIR.leftRadius,
          STICK.radius,
          right - left,
          10,
        ),
        material("#776044"),
      );
      twig.name = "Twig";
      twig.position.set((left + right) / 2, y, 0);
      twig.rotation.z = Math.PI / 2;
      twig.castShadow = true;
      root.add(twig);
      geometryNodes.push(twig);
      for (let x = left + 1.35; x < right - 0.7; x += 4.35) {
        const radius =
          AIR.leftRadius +
          ((STICK.radius - AIR.leftRadius) * (x - left)) / (right - left);
        const node = new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.009, 4, 10),
          material("#8c7350"),
        );
        node.rotation.y = Math.PI / 2;
        node.position.set(x, y, 0);
        root.add(node);
        geometryNodes.push(node);
      }
    }
  }
  // A palm on the far side, curled fingers on the camera side and a thumb
  // crossing above the twig establish an actual enclosing hand grip. The
  // complete holder sits beyond the opponent's full endpoint silhouette.
  const holder = new THREE.Group();
  holder.name = "Holder";
  holder.position.x = STICK.holderOffset;
  root.add(holder);
  const skin = "#b48362",
    lightSkin = "#c79771";
  ellipsoid(holder, skin, [6.64, -0.31, -0.25], [0.48, 0.5, 0.27]);
  for (let i = 0; i < 4; i++) {
    const x = 6.19 + i * 0.19;
    link(
      holder,
      skin,
      [x, -0.54, -0.16],
      [x - 0.035, -0.27, 0.17],
      0.09,
      0.085,
    );
    link(
      holder,
      lightSkin,
      [x - 0.035, -0.27, 0.17],
      [x - 0.06, 0.015, 0.13],
      0.085,
      0.074,
    );
    link(
      holder,
      lightSkin,
      [x - 0.06, 0.015, 0.13],
      [x - 0.075, 0.095, -0.01],
      0.074,
      0.064,
    );
    ellipsoid(
      holder,
      lightSkin,
      [x - 0.035, -0.27, 0.17],
      [0.086, 0.09, 0.086],
    );
    ellipsoid(
      holder,
      "#d4ac8a",
      [x - 0.065, 0.047, 0.126],
      [0.048, 0.059, 0.017],
    );
  }
  link(
    holder,
    lightSkin,
    [6.98, -0.12, -0.15],
    [6.56, 0.15, 0.015],
    0.13,
    0.11,
  );
  link(
    holder,
    lightSkin,
    [6.56, 0.15, 0.015],
    [6.27, 0.095, 0.05],
    0.11,
    0.085,
  );
  const elbowY = -1.25 - STICK_LIFT / 2;
  link(holder, skin, [6.84, -0.65, -0.23], [7.45, elbowY, -0.35], 0.23, 0.3);
  link(
    holder,
    skin,
    [7.45, elbowY, -0.35],
    [8.04, -1.65 - STICK_LIFT, -0.5],
    0.3,
    0.36,
  );
  const shirt = "#697e83";
  link(
    holder,
    "#87989a",
    [7.96, -1.57 - STICK_LIFT, -0.49],
    [8.1, -1.68 - STICK_LIFT, -0.53],
    0.43,
    0.44,
  );
  link(
    holder,
    shirt,
    [8.0, -1.65 - STICK_LIFT, -0.5],
    [8.48, -1.86 - STICK_LIFT, -0.64],
    0.45,
    0.53,
  );
  ellipsoid(holder, shirt, [9, -2.57 - STICK_LIFT, -0.9], [1.15, 1.36, 0.65]);
  const leftHolder = holder.clone(true);
  leftHolder.name = "Left holder";
  leftHolder.scale.x = -1;
  root.add(leftHolder);
  root.setStage = (value) => {
    const layout = getStage(value);
    drawTwigs(layout);
    holder.position.x =
      STICK.holderOffset + (layout.sticks.at(-1).body[1] - STICK.rightEnd);
    holder.position.y = layout.sticks.at(-1).y;
    leftHolder.visible = layout.sticks.length > 1;
    leftHolder.position.x = layout.sticks[0].body[0] + 0.6 + 6.5;
    leftHolder.position.y = layout.sticks[0].y;
    root.userData.stage = layout.id;
  };
  root.setStage(stage);
  // Restore twig-first child order after rebuilding, used by geometric inspection.
  root.children.sort(
    (a, b) => Number(b.name === "Twig") - Number(a.name === "Twig"),
  );
  return root;
}
