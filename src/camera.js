import * as THREE from 'three';
import { AIR } from './aerial.js';
import { MAP_SCALE } from './movement.js';

// Keep the complete drop/retrieve volume between the HUD bands, including on
// short/wide screens where fitting only the twig would hide the pavement.
export function fitPlayCamera(camera, width, height) {
  const short = width > 600 && height <= 520;
  const topBand = short ? 104 : 148;
  const bottomBand = short ? 94 : width <= 600 ? 174 : 132;
  camera.updateMatrixWorld(true);
  const top = new THREE.Vector3(0, AIR.stickY + 0.2, 0).applyMatrix4(camera.matrixWorldInverse).y;
  const bottom = new THREE.Vector3(0, -2.55, 0).applyMatrix4(camera.matrixWorldInverse).y;
  const aspect = width / height, usable = Math.max(height * 0.25, height - topBand - bottomBand);
  const halfHeight = Math.max(8.6 * MAP_SCALE / aspect, (top - bottom) * height / (2 * usable));
  const halfWidth = halfHeight * aspect;
  // Pin the pavement to the bottom HUD band; the wider arena's extra vertical
  // room becomes sky instead of empty space below the street.
  const center = bottom + halfHeight * (1 - 2 * bottomBand / height);
  const centerX = 1.7 * MAP_SCALE;
  camera.left = centerX - halfWidth; camera.right = centerX + halfWidth;
  camera.top = center + halfHeight; camera.bottom = center - halfHeight;
  camera.updateProjectionMatrix();
  return { topBand, bottomBand };
}
