import * as THREE from 'three';
import { AIR, silkEndpoints } from './aerial.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createSilkLine(parent) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#fff8df', transparent: true, opacity: 0.95, depthWrite: false }));
  line.frustumCulled = false; line.visible = false; parent.add(line);
  const outlineGeometry = new LineGeometry(); outlineGeometry.setPositions([0, 0, 0, 0, 0, 0]);
  const outlineMaterial = new LineMaterial({ color: '#364b43', linewidth: 3, transparent: true, opacity: 0.7, depthWrite: false });
  const outline = new Line2(outlineGeometry, outlineMaterial); outline.frustumCulled = false; outline.visible = false;
  outline.renderOrder = 1; line.renderOrder = 2; parent.add(outline);
  const origin = new THREE.Vector3();
  return { line, setResolution(width, height) { outlineMaterial.resolution.set(width, height); }, update(rig, fighter) {
    const endpoints = silkEndpoints(fighter); line.visible = outline.visible = endpoints.visible;
    if (!line.visible) return;
    rig.root.updateWorldMatrix(true, true);
    rig.spinneret.getWorldPosition(origin); parent.worldToLocal(origin);
    const progress = fighter.air.mode === 'deploying' ? Math.min(1, fighter.air.ticks / AIR.deployTicks) : 1;
    const positions = geometry.attributes.position;
    positions.setXYZ(0, origin.x, origin.y, origin.z);
    positions.setXYZ(1, origin.x + (endpoints.anchor[0] - origin.x) * progress, origin.y + (endpoints.anchor[1] - origin.y) * progress, origin.z + (endpoints.anchor[2] - origin.z) * progress);
    positions.needsUpdate = true;
    const ribbon = outlineGeometry.attributes.instanceStart.data;
    ribbon.array.set(positions.array); ribbon.needsUpdate = true;
  } };
}
