import * as THREE from "three";
import { AIR } from "./aerial.js";
import { MAP_SCALE } from "./movement.js";
import { span, getStage } from "./stage.js";

// Keep the complete drop/retrieve volume between the HUD bands, including on
// short/wide screens where fitting only the twig would hide the pavement.
export function fitPlayCamera(
  camera,
  width,
  height,
  focus = { x: 1.7 * MAP_SCALE, halfSpan: 8.6 * MAP_SCALE },
) {
  const short = width > 600 && height <= 520;
  const topBand = short ? 104 : 148;
  const bottomBand = short ? 94 : width <= 600 ? 174 : 132;
  camera.updateMatrixWorld(true);
  const top = new THREE.Vector3(
    0,
    AIR.stickY + (focus.topY ?? 0) + 1.6,
    0,
  ).applyMatrix4(camera.matrixWorldInverse).y;
  const bottom = new THREE.Vector3(0, -2.55, 0).applyMatrix4(
    camera.matrixWorldInverse,
  ).y;
  const aspect = width / height,
    usable = Math.max(height * 0.25, height - topBand - bottomBand);
  const halfHeight = Math.max(
    focus.halfSpan / aspect,
    ((top - bottom) * height) / (2 * usable),
  );
  const halfWidth = halfHeight * aspect;
  // Pin the pavement to the bottom HUD band; the wider arena's extra vertical
  // room becomes sky instead of empty space below the street.
  const center = bottom + halfHeight * (1 - (2 * bottomBand) / height);
  const centerX = focus.x;
  camera.left = centerX - halfWidth;
  camera.right = centerX + halfWidth;
  camera.top = center + halfHeight;
  camera.bottom = center - halfHeight;
  camera.updateProjectionMatrix();
  return { topBand, bottomBand };
}

// Frame both fighters with a bounded zoom. Exponential easing has the same
// response at 30, 60 or 144 render Hz; physics remains on its fixed clock.
export function followCameraFocus(
  focus,
  fighters,
  stage,
  deltaSeconds = 1 / 60,
) {
  const xs = fighters.map((fighter) => fighter.x),
    [low, high] = span(stage);
  focus.topY = Math.max(
    ...getStage(stage).sticks.map((stick) => stick.y),
    ...fighters.map((fighter) => fighter.air?.y ?? 0),
  );
  const midpoint = (Math.min(...xs) + Math.max(...xs)) / 2;
  const targetSpan = Math.min(
    (high - low) / 2 + 1.8,
    Math.max(4.2, (Math.max(...xs) - Math.min(...xs)) / 2 + 1.8),
  );
  const targetX = Math.max(low, Math.min(high, midpoint));
  const blend = 1 - Math.exp(-5 * Math.max(0, Math.min(0.1, deltaSeconds)));
  focus.x += (targetX - focus.x) * blend;
  // Widen immediately enough to keep both spiders visible during a lunge.
  focus.halfSpan = Math.max(
    (Math.max(...xs) - Math.min(...xs)) / 2 +
      Math.abs(midpoint - focus.x) +
      1.2,
    focus.halfSpan + (targetSpan - focus.halfSpan) * blend,
  );
  return focus;
}
