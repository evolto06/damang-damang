import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RULES } from './movement.js';
import { COMBAT, clearGap } from './combat.js';
import { createAI, decideAI } from './ai.js';
import { createRuntime, clearActions, setReady, queueAction, queueDirection, pauseRuntime, restartRuntime, frameRuntime } from './runtime.js';
import './style.css';
import { createStreet, createHeldStick, STICK } from './scene.js';
import { createSpiderRig, inspectRig } from './spider-rig.js';
import { fightFeedback } from './feedback.js';
import { fitPlayCamera } from './camera.js';
import { createSilkLine } from './silk.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const camera = new THREE.OrthographicCamera(-9, 9, 5.5, -5.5, 0.1, 100);
camera.position.set(0, 0.15, 18);
camera.lookAt(0, 0.4, 0);
createStreet(scene);
const heldStickRoot = createHeldStick(scene);
const runtime = createRuntime({ createOpponent: createAI, decideOpponent: decideAI });
const held = new Set();
const pointerDirections = new Map();
let rigs = [];
let silks = [];
let dialog = null;
const assetStatus = $('#asset-status');
new GLTFLoader().load('/models/spider.glb', gltf => {
  rigs = [createSpiderRig(gltf.scene, 0), createSpiderRig(gltf.scene, 1)];
  for (const rig of rigs) heldStickRoot.add(rig.root);
  silks = rigs.map(() => createSilkLine(heldStickRoot));
  silks.forEach(silk => silk.setResolution(canvas.clientWidth, canvas.clientHeight));
  clearInput(); setReady(runtime, true);
  assetStatus.hidden = true;
}, undefined, error => {
  console.error('Spider model could not be loaded:', error);
  assetStatus.textContent = 'Spider model unavailable. Check public/models/spider.glb and reload.';
});
function clearInput() { held.clear(); pointerDirections.clear(); clearActions(runtime); }
// Simulation ticks at a fixed 60 Hz; the renderer blends the last two ticks so
// movement stays smooth on monitors that do not refresh on tick boundaries.
function renderFighters(world, alpha) {
  return world.fighters.map((fighter, index) => {
    const from = world.previous?.[index] ?? { x: fighter.x, y: fighter.air.y };
    const x = from.x + (fighter.x - from.x) * alpha;
    const y = from.y + (fighter.air.y - from.y) * alpha;
    return { x, fighter: x === fighter.x && y === fighter.air.y ? fighter : { ...fighter, x, air: { ...fighter.air, y } } };
  });
}
function directionInput(timestamp) {
  const keyboard = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
  const touch = [...pointerDirections.values()].reduce((sum, value) => sum + value, 0);
  queueDirection(runtime, Math.sign(keyboard + touch), timestamp);
}
function showDialog(kind) {
  dialog = kind;
  $('#overlay').hidden = !kind;
  $('#pause').setAttribute('aria-label', kind ? 'Resume game' : 'Pause game');
  if (!kind) { canvas.focus({ preventScroll: true }); return; }
  const result = kind === 'result';
  const winner = runtime.world.winner;
  const title = winner === 'draw' ? 'A draw.' : winner === 'player' ? 'Panalo! You win.' : 'Kalaban wins.';
  $('#dialog-title').textContent = result ? title : 'Fight paused.';
  $('#dialog-copy').textContent = result ? 'The round is over. Start a fresh fight when you’re ready.' : 'Take a moment. Resume when you’re ready.';
  $('#help-grid').hidden = result;
  $('#dialog-footnote').hidden = result;
  $('#dialog-restart').hidden = result;
  $('#resume').textContent = result ? 'Laban ulit / Fight again →' : 'Tuloy / Resume →';
  $('#resume').setAttribute('aria-label', result ? 'Restart fight' : 'Resume game');
  if (result) $('#round-announcement').textContent = title;
  $('#resume').focus();
}
function setPaused(value) {
  if (runtime.world.status === 'ended') return;
  clearInput(); pauseRuntime(runtime, value); showDialog(value ? 'pause' : null);
}
function restart() {
  clearInput(); restartRuntime(runtime); $('#round-announcement').textContent = '';
  for (const rig of rigs) { rig.update(runtime.world.fighters[rig.index].x, runtime.world.fighters[rig.index]); silks[rig.index].update(rig, runtime.world.fighters[rig.index]); }
  showDialog(null);
}
$('#pause').addEventListener('click', () => setPaused(!runtime.paused));
$('#resume').addEventListener('click', () => runtime.world.status === 'ended' ? restart() : setPaused(false));
$('#dialog-restart').addEventListener('click', restart);
$('#help').addEventListener('click', () => setPaused(true));
$('#reset').addEventListener('click', restart);
for (const kind of ['dash', 'bite', 'drop', 'web']) {
  const button = $('#' + kind);
  button.addEventListener('pointerdown', event => { event.preventDefault(); queueAction(runtime, kind, event.timeStamp); });
  button.addEventListener('click', event => { if (event.detail === 0) queueAction(runtime, kind, event.timeStamp); });
}
for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return;
    button.setPointerCapture(event.pointerId);
    pointerDirections.set(event.pointerId, Number(button.dataset.direction)); directionInput(event.timeStamp);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => {
    if (pointerDirections.delete(event.pointerId)) directionInput(event.timeStamp);
  });
}
window.addEventListener('keydown', event => {
  if (dialog && event.code === 'Tab') {
    const buttons = [$('#resume'), $('#dialog-restart')].filter(button => !button.hidden);
    const current = buttons.indexOf(document.activeElement);
    buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    event.preventDefault(); return;
  }
  if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD', 'KeyJ', 'KeyS', 'KeyC'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyR') { restart(); return; }
  if (event.code === 'Escape') { setPaused(!runtime.paused); return; }
  if (event.code === 'KeyH' || event.key === '?') { setPaused(true); return; }
  if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return;
  if (event.code === 'KeyJ') queueAction(runtime, 'bite', event.timeStamp);
  if (event.code === 'ArrowDown' || event.code === 'KeyS') queueAction(runtime, 'drop', event.timeStamp);
  if (event.code === 'KeyC') queueAction(runtime, 'web', event.timeStamp);
  if (['Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) queueAction(runtime, 'dash', event.timeStamp);
  if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { held.add(event.code); directionInput(event.timeStamp); }
});
window.addEventListener('keyup', event => { if (held.delete(event.code)) directionInput(event.timeStamp); });
window.addEventListener('blur', () => { clearInput(); setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); setPaused(true); } });

function resize() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  fitPlayCamera(camera, width, height);
  silks.forEach(silk => silk.setResolution(width, height));
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(time => {
  frameRuntime(runtime, time);
  const world = runtime.world;
  if (world.status === 'ended' && dialog !== 'result') { clearInput(); showDialog('result'); }
  const alpha = runtime.ready && !runtime.paused && world.status === 'playing' ? runtime.alpha : 1;
  const shown = renderFighters(world, alpha);
  for (const rig of rigs) {
    const { x, fighter } = shown[rig.index];
    rig.update(x, fighter); silks[rig.index].update(rig, fighter);
  }
  const feedback = fightFeedback(runtime);
  const prompt = $('#fight-prompt');
  if (prompt.textContent !== feedback.prompt) prompt.textContent = feedback.prompt;
  for (const [index, fighter] of world.fighters.entries()) {
    const prefix = index ? 'opponent' : 'player';
    $('#' + prefix + '-hp').textContent = `${fighter.hp} / ${COMBAT.maxHealth}`;
    const health = $('#' + prefix + '-health');
    health.setAttribute('aria-valuenow', fighter.hp);
    health.firstElementChild.style.width = `${fighter.hp}%`;
    const phase = $('#' + prefix + '-phase');
    phase.textContent = feedback.phases[index];
    phase.dataset.phase = fighter.phase;
  }
  $('#distance').innerHTML = `${clearGap(world).toFixed(1)} <small>u</small>`;
  $('#distance-fill').style.width = `${Math.min(100, clearGap(world) / 7 * 100)}%`;
  const player = world.fighters[0];
  for (const [kind, state] of Object.entries(feedback.actions)) {
    const button = $('#' + kind);
    button.disabled = state.disabled;
    $('#' + kind + '-status').textContent = state.caption;
    button.title = state.disabled ? `${button.querySelector('strong').textContent}: ${state.caption}` : button.getAttribute('aria-label');
  }
  $('#dash').classList.toggle('cooling', feedback.cooling);
  $('#cooldown').style.width = `${100 * (1 - player.cooldown / RULES.dashCooldown)}%`;
  for (const button of document.querySelectorAll('[data-direction]')) {
    button.disabled = feedback.movementDisabled;
    button.classList.toggle('pressed', !feedback.movementDisabled && runtime.direction === Number(button.dataset.direction));
  }
  renderer.render(scene, camera);
});
if (import.meta.env.DEV) window.__spiderDerby = {
  getState: () => ({ ...structuredClone(runtime.world), paused: runtime.paused, ready: runtime.ready, loadedModels: rigs.length }), rules: { ...RULES, ...COMBAT },
  inspectScene: () => ({ stick: STICK, rigs: rigs.map(inspectRig), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
};
