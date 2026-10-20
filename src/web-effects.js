import * as THREE from 'three';
import { WEB, headCenter } from './web-attack.js';

// A travelling net and short wake are finite, never a target-spanning beam.
function net(material) {
  const points = [];
  for (let ring = 1; ring <= 3; ring++) for (let edge = 0; edge < 8; edge++) {
    const a = edge * Math.PI / 4, b = (edge + 1) * Math.PI / 4, radius = ring / 3;
    points.push(0, Math.cos(a) * radius, Math.sin(a) * radius, 0, Math.cos(b) * radius, Math.sin(b) * radius);
  }
  for (let spoke = 0; spoke < 8; spoke++) { const a = spoke * Math.PI / 4; points.push(0, 0, 0, 0, Math.cos(a), Math.sin(a)); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, material);
}
export function createWebEffects(parent) {
  const material = new THREE.LineBasicMaterial({ color: '#efffff', depthWrite: false });
  const bolts = [], wraps = [0, 1].map(() => { const mesh = net(material); mesh.visible = false; parent.add(mesh); return mesh; });
  return { update(world, shown = world.fighters, alpha = 1) {
    while (bolts.length < world.projectiles.length) {
      const group = new THREE.Group(), mesh = net(material);
      mesh.scale.setScalar(WEB.radius * 1.4); mesh.rotation.y = Math.PI / 2; group.add(mesh);
      const tailGeometry = new THREE.BufferGeometry(); tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const tail = new THREE.Line(tailGeometry, material); group.add(tail); parent.add(group); bolts.push({ group, tail });
    }
    bolts.forEach(({ group, tail }, index) => {
      const shot = world.projectiles[index]; group.visible = !!shot && world.status === 'playing'; if (!group.visible) return;
      const point = shot.position.map((value, axis) => shot.previous[axis] + (value - shot.previous[axis]) * alpha);
      group.position.fromArray(point); group.rotation.z = Math.atan2(shot.velocity[1], shot.velocity[0]);
      const positions = tail.geometry.attributes.position;
      // Local X follows the flight vector; the wake never exceeds one tick.
      positions.setXYZ(1, -Math.hypot(...shot.velocity), 0, 0); positions.needsUpdate = true;
    });
    wraps.forEach((mesh, index) => {
      const fighter = shown[index]; mesh.visible = fighter.phase === 'webstun' && world.status === 'playing';
      if (!mesh.visible) return;
      mesh.position.fromArray(headCenter(fighter)); mesh.rotation.y = Math.PI / 2;
      mesh.scale.set(0.22, 0.18, 0.22);
    });
  } };
}
