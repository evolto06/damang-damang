import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createState, advance, RULES } from './movement.js';
import './style.css';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#374e3c');
scene.fog = new THREE.FogExp2('#374e3c', 0.036);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const camera = new THREE.OrthographicCamera(-9, 9, 5.5, -5.5, 0.1, 100);
camera.position.set(0, 7.7, 12.5);
camera.lookAt(0, 1.45, 0);
scene.add(new THREE.HemisphereLight('#eeecd1', '#213a25', 2.4));
const sunlight = new THREE.DirectionalLight('#ffe5aa', 4);
sunlight.position.set(-4, 9, 6);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
Object.assign(sunlight.shadow.camera, { left: -10, right: 10, top: 6, bottom: -6, near: 0.1, far: 30 });
sunlight.shadow.normalBias = 0.025;
sunlight.shadow.bias = -0.0002;
scene.add(sunlight);
const rim = new THREE.DirectionalLight('#a9cbbb', 1.8);
rim.position.set(3, 4, -6);
scene.add(rim);

const mat = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const bambooMat = mat('#a0a75a');
const nodeMat = mat('#6b7b3e');
const endMat = mat('#c8ba73');
const darkMat = mat('#435733');
const stick = new THREE.Group();
stick.position.y = 1.2;
scene.add(stick);
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 13.4, 24, 1), bambooMat);
shaft.rotation.z = Math.PI / 2;
shaft.castShadow = true;
shaft.receiveShadow = true;
stick.add(shaft);
for (const x of [-5.6, -3.0, -0.4, 2.3, 4.9]) {
  const node = new THREE.Mesh(new THREE.TorusGeometry(0.471, 0.027, 6, 32), nodeMat);
  node.rotation.y = Math.PI / 2;
  node.position.x = x;
  node.castShadow = true;
  stick.add(node);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.476, 0.009, 4, 32), endMat);
  seam.rotation.y = Math.PI / 2;
  seam.position.x = x + 0.058;
  stick.add(seam);
}
for (const sign of [-1, 1]) {
  const cut = new THREE.Mesh(new THREE.CircleGeometry(0.46, 32), endMat);
  cut.rotation.y = sign * Math.PI / 2;
  cut.position.x = sign * 6.705;
  stick.add(cut);
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), darkMat);
  hollow.rotation.y = sign * Math.PI / 2;
  hollow.position.x = sign * 6.709;
  stick.add(hollow);
}
// Fine lengthwise fibers catch the light without requiring downloaded textures.
for (let i = 0; i < 24; i++) {
  const angle = i * Math.PI * 2 / 24;
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 13.2, 3), i % 3 ? nodeMat : endMat);
  line.rotation.z = Math.PI / 2;
  line.position.set(0, Math.sin(angle) * 0.469, Math.cos(angle) * 0.469);
  stick.add(line);
}
const supportMat = mat('#34452c');
for (const x of [-5.1, 5.1]) {
  for (const z of [-0.45, 0.45]) {
    const support = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.15, 2.8, 8), supportMat);
    support.position.set(x, -0.4, z);
    support.rotation.x = z < 0 ? -0.2 : 0.2;
    support.castShadow = true;
    scene.add(support);
  }
  for (let i = 0; i < 5; i++) {
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.022, 5, 24, Math.PI * 1.25), mat('#675c3a'));
    cord.rotation.set(0, Math.PI / 2, Math.PI * 0.86);
    cord.position.set(x - 0.1 + i * 0.05, 1.17, 0);
    scene.add(cord);
  }
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat('#354c34'));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.75;
ground.receiveShadow = true;
scene.add(ground);
// Quiet bamboo silhouettes and low-poly leaves give the stick a sheltered grove.
let seed = 79;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const foliageMat = mat('#2c4430');
for (let i = 0; i < 38; i++) {
  const x = (random() - 0.5) * 45;
  const z = -4 - random() * 23;
  const height = 9 + random() * 12;
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 + random() * 0.1, 0.21, height, 6), foliageMat);
  stalk.position.set(x, height / 2 - 2, z);
  stalk.rotation.z = (random() - 0.5) * 0.16;
  scene.add(stalk);
  for (let j = 0; j < 4; j++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.27, 2.3, 3), foliageMat);
    leaf.position.set(x + (j % 2 ? 0.7 : -0.7), 2 + j * 1.8 + random(), z);
    leaf.rotation.z = j % 2 ? -1.1 : 1.1;
    scene.add(leaf);
  }
}
const motes = new THREE.BufferGeometry();
const motePositions = new Float32Array(65 * 3);
for (let i = 0; i < 65; i++) { motePositions[i * 3] = (random() - 0.5) * 22; motePositions[i * 3 + 1] = random() * 7; motePositions[i * 3 + 2] = (random() - 0.5) * 13; }
motes.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
const dust = new THREE.Points(motes, new THREE.PointsMaterial({ color: '#f2de9a', size: 0.022, transparent: true, opacity: 0.5, depthWrite: false }));
scene.add(dust);

let state = createState();
let paused = false;
let dashRequested = false;
const held = new Set();
const pointerDirections = new Map();
let phase = 0;
const player = new THREE.Group();
const opponent = new THREE.Group();
player.rotation.y = Math.PI / 2;
opponent.rotation.y = -Math.PI / 2;
scene.add(player, opponent);
let rigs = [];
const assetStatus = $('#asset-status');
new GLTFLoader().load('/models/spider.glb', gltf => {
  for (const [index, root] of [player, opponent].entries()) {
    const model = gltf.scene.clone(true);
    model.scale.setScalar(0.18);
    const pivots = [];
    model.traverse(object => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
      if (object.name.startsWith('Gait_')) {
        const left = object.name.includes('_L');
        const leg = Number(object.name.slice(-1));
        object.rotation.z = left ? 0.64 : -0.64;
        pivots.push({ object, left, leg, baseZ: object.rotation.z });
      }
    });
    root.add(model);
    rigs.push({ root, model, pivots, index });
  }
  assetStatus.hidden = true;
}, undefined, error => {
  console.error('Spider model could not be loaded:', error);
  assetStatus.textContent = 'Spider model unavailable. Check public/models/spider.glb and reload.';
});

function clearInput() { held.clear(); pointerDirections.clear(); dashRequested = false; }
function setPaused(value) {
  paused = value;
  clearInput();
  $('#overlay').hidden = !paused;
  $('#pause').setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  if (paused) $('#resume').focus(); else canvas.focus({ preventScroll: true });
}
function reset() { state = createState(); phase = 0; clearInput(); }
$('#pause').addEventListener('click', () => setPaused(!paused));
$('#resume').addEventListener('click', () => setPaused(false));
$('#help').addEventListener('click', () => setPaused(true));
$('#reset').addEventListener('click', reset);
$('#dash').addEventListener('pointerdown', event => { event.preventDefault(); if (!paused) dashRequested = true; });
$('#dash').addEventListener('click', event => { if (event.detail === 0 && !paused) dashRequested = true; });
for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); if (!paused) pointerDirections.set(event.pointerId, Number(button.dataset.direction)); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => pointerDirections.delete(event.pointerId));
}
window.addEventListener('keydown', event => {
  if (paused && event.code === 'Tab') { event.preventDefault(); $('#resume').focus(); return; }
  if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
  if (['ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'Escape') { setPaused(!paused); return; }
  if (event.code === 'KeyH' || event.key === '?') { setPaused(true); return; }
  if (paused) return;
  if (event.code === 'KeyR') { reset(); return; }
  if (['Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) dashRequested = true;
  held.add(event.code);
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => setPaused(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const halfWidth = aspect < 0.8 ? 8.1 : 8.6;
  const halfHeight = halfWidth / aspect;
  camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let previousTime = null;
let elapsed = 0;
renderer.setAnimationLoop(time => {
  const dt = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;
  const keyboard = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
  const touch = [...pointerDirections.values()].reduce((sum, value) => sum + value, 0);
  const direction = Math.sign(keyboard + touch);
  const oldX = state.x;
  if (!paused) { advance(state, { direction, dash: dashRequested }, dt); elapsed += dt; }
  dashRequested = false;
  phase += (state.x - oldX) * 8;
  player.position.set(state.x, 1.62, 0);
  opponent.position.set(state.opponentX, 1.62, 0);
  for (const rig of rigs) {
    const moving = !paused && rig.index === 0 && Math.abs(state.x - oldX) > 0.00001;
    for (const pivot of rig.pivots) {
      const offset = pivot.leg * 1.7 + (pivot.left ? Math.PI : 0);
      pivot.object.rotation.y = moving ? Math.sin(phase + offset) * 0.085 : 0;
      pivot.object.rotation.z = pivot.baseZ + (moving ? Math.max(0, Math.sin(phase + offset + 1)) * 0.08 * (pivot.left ? -1 : 1) : 0);
    }
    rig.model.position.y = Math.sin(elapsed * 2.7 + rig.index * 2) * 0.008;
  }
  dust.rotation.y = elapsed * 0.008;
  $('#distance').innerHTML = `${(state.opponentX - state.x - RULES.separation).toFixed(1)} <small>u</small>`;
  $('#distance-fill').style.width = `${Math.min(100, (state.opponentX - state.x - RULES.separation) / 7 * 100)}%`;
  const cooling = state.cooldown > 0.01;
  $('#dash').classList.toggle('cooling', cooling);
  $('#dash').setAttribute('aria-label', cooling ? `Lunge recharging: ${state.cooldown.toFixed(1)} seconds` : 'Lunge. Shift or Space');
  $('#dash-status').textContent = cooling ? `READY IN ${state.cooldown.toFixed(1)}s` : 'SHIFT / SPACE';
  $('#cooldown').style.width = `${100 * (1 - state.cooldown / RULES.dashCooldown)}%`;
  for (const button of document.querySelectorAll('[data-direction]')) button.classList.toggle('pressed', !paused && direction === Number(button.dataset.direction));
  renderer.render(scene, camera);
});
if (import.meta.env.DEV) window.__spiderDerby = { getState: () => ({ ...state, paused, loadedModels: rigs.length }), rules: RULES };
