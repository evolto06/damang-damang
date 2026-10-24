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
import { createWebEffects } from './web-effects.js';
import { createSilkLine } from './silk.js';
import { createControllerInput, combinedDirection } from './controller.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene');
const BINDS = {
  bot: {
    KeyA: ['move', 0, -1], KeyD: ['move', 0, 1], ArrowLeft: ['move', 0, -1], ArrowRight: ['move', 0, 1],
    KeyJ: ['action', 0, 'bite'], KeyK: ['action', 0, 'shoot'], KeyS: ['action', 0, 'drop'], ArrowDown: ['action', 0, 'drop'],
    KeyC: ['action', 0, 'web'], ShiftLeft: ['action', 0, 'dash'], ShiftRight: ['action', 0, 'dash'], Space: ['action', 0, 'dash'],
  },
  pvp: {
    KeyA: ['move', 0, -1], KeyD: ['move', 0, 1], KeyS: ['action', 0, 'drop'], KeyW: ['action', 0, 'web'],
    KeyQ: ['action', 0, 'bite'], KeyE: ['action', 0, 'shoot'], KeyF: ['action', 0, 'dash'],
    ArrowLeft: ['move', 1, -1], ArrowRight: ['move', 1, 1], ArrowDown: ['action', 1, 'drop'], ArrowUp: ['action', 1, 'web'],
    Comma: ['action', 1, 'bite'], Period: ['action', 1, 'shoot'], Slash: ['action', 1, 'dash'],
  },
};
let bindings = BINDS.bot;
let matchStarted = false;
let assetsReady = false;
const startButton = $('#start-bot');
const pvpButton = $('#start-pvp');
const startStatus = $('#start-status');
function launchError(message) {
  startStatus.textContent = message;
  startStatus.dataset.state = 'error';
  startButton.disabled = true;
  pvpButton.disabled = true;
  $('#start-retry').hidden = false;
}
$('#start-retry').addEventListener('click', () => window.location.reload());
const scene = new THREE.Scene();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  launchError('The game needs WebGL to run. Try a browser with hardware acceleration enabled, then reload.');
  throw error;
}
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
const webEffects = createWebEffects(heldStickRoot);
const runtime = createRuntime({ createOpponent: createAI, decideOpponent: decideAI });
const held = [new Set(), new Set()];
const pointerDirections = new Map();
const controller = createControllerInput();
const controllerDirections = [0, 0];
let rigs = [];
let silks = [];
let dialog = null;
const assetStatus = $('#asset-status');
new GLTFLoader().load('/models/spider.glb', gltf => {
  rigs = [createSpiderRig(gltf.scene, 0), createSpiderRig(gltf.scene, 1)];
  for (const rig of rigs) heldStickRoot.add(rig.root);
  silks = rigs.map(() => createSilkLine(heldStickRoot));
  silks.forEach(silk => silk.setResolution(canvas.clientWidth, canvas.clientHeight));
  clearInput();
  assetsReady = true;
  startButton.disabled = false;
  pvpButton.disabled = false;
  startStatus.textContent = 'Ready when you are. Choose Bot Match or PvP to begin.';
  startStatus.dataset.state = 'ready';
  assetStatus.hidden = true;
}, undefined, error => {
  console.error('Spider model could not be loaded:', error);
  launchError('The spiders could not load. Check your connection and reload to try again.');
});
function applyMode(mode) {
  const pvp = mode === 'pvp';
  $('#player-name').textContent = pvp ? 'P1' : 'Ikaw';
  $('#opponent-name').textContent = pvp ? 'P2' : 'Kalaban';
  $('#player-detail').hidden = pvp;
  $('#opponent-detail').hidden = pvp;
  $('#move-hint').textContent = pvp ? 'A / D' : 'A / D · ← / →';
  $('#player-health').setAttribute('aria-label', pvp ? 'P1 health' : 'Your health');
  $('#opponent-health').setAttribute('aria-label', pvp ? 'P2 health' : 'Opponent health');
  $('#shoot').setAttribute('aria-label', `Shoot a web to briefly stun the opponent. ${pvp ? 'E' : 'K'}`);
  $('#bite').setAttribute('aria-label', `Bite. ${pvp ? 'Q' : 'J'}`);
  $('#dash').setAttribute('aria-label', `Lunge. ${pvp ? 'F' : 'Shift or Space'}`);
  $('#drop').setAttribute('aria-label', `Drop from the stick. ${pvp ? 'S' : 'Down arrow or S'}`);
  $('#web').setAttribute('aria-label', `Shoot silk and return to the stick. ${pvp ? 'W' : 'C'}`);
}
function startMatch(mode) {
  controller.selectMode(mode);
  if (!assetsReady || matchStarted) return;
  matchStarted = true;
  runtime.mode = mode;
  bindings = BINDS[mode];
  applyMode(mode);
  clearInput();
  setReady(runtime, true);
  $('#start-screen').hidden = true;
  $('#game').classList.remove('at-menu');
  $('#match-ui').inert = false;
  $('#match-ui').removeAttribute('aria-hidden');
  canvas.tabIndex = 0;
  canvas.removeAttribute('aria-hidden');
  canvas.focus({ preventScroll: true });
}
startButton.addEventListener('click', () => startMatch('bot'));
pvpButton.addEventListener('click', () => startMatch('pvp'));
function clearInput() { for (const keys of held) keys.clear(); pointerDirections.clear(); controllerDirections.fill(0); controller.reset(); clearActions(runtime); }
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
function directionInput(fighter, timestamp) {
  let keyboard = 0;
  for (const code of held[fighter]) keyboard += bindings[code]?.[2] ?? 0;
  const touch = fighter === 0 ? [...pointerDirections.values()].reduce((sum, value) => sum + value, 0) : 0;
  queueDirection(runtime, fighter, combinedDirection(keyboard, touch, controllerDirections[fighter]), timestamp);
}
function showDialog(kind) {
  dialog = kind;
  $('#overlay').hidden = !kind;
  $('#pause').setAttribute('aria-label', kind ? 'Resume game' : 'Pause game');
  if (!kind) { canvas.focus({ preventScroll: true }); return; }
  const result = kind === 'result';
  const pvp = runtime.mode === 'pvp';
  const winner = runtime.world.winner;
  const title = winner === 'draw' ? 'A draw.' : pvp ? (winner === 'player' ? 'Panalo si P1.' : 'Panalo si P2.') : (winner === 'player' ? 'Panalo! You win.' : 'Kalaban wins.');
  $('#dialog-title').textContent = result ? title : 'Fight paused.';
  $('#dialog-copy').textContent = result ? 'The round is over. Start a fresh fight when you’re ready.' : 'Take a moment. Resume when you’re ready.';
  $('#help-grid').hidden = result || pvp;
  $('#pvp-help').hidden = result || !pvp;
  $('#dialog-footnote').hidden = result || pvp;
  $('#dialog-restart').hidden = result;
  $('#resume').textContent = result ? 'Laban ulit / Fight again →' : 'Tuloy / Resume →';
  $('#resume').setAttribute('aria-label', result ? 'Restart fight' : 'Resume game');
  if (result) $('#round-announcement').textContent = title;
  $('#resume').focus();
}
function setPaused(value) {
  if (!matchStarted) return;
  if (runtime.world.status === 'ended') return;
  clearInput(); pauseRuntime(runtime, value); showDialog(value ? 'pause' : null);
}
function restart() {
  if (!matchStarted) return;
  clearInput(); restartRuntime(runtime); $('#round-announcement').textContent = '';
  for (const rig of rigs) { rig.update(runtime.world.fighters[rig.index].x, runtime.world.fighters[rig.index]); silks[rig.index].update(rig, runtime.world.fighters[rig.index]); }
  showDialog(null);
}
$('#pause').addEventListener('click', () => setPaused(!runtime.paused));
$('#resume').addEventListener('click', () => runtime.world.status === 'ended' ? restart() : setPaused(false));
$('#dialog-restart').addEventListener('click', restart);
$('#help').addEventListener('click', () => setPaused(true));
$('#reset').addEventListener('click', restart);
for (const kind of ['dash', 'bite', 'drop', 'web', 'shoot']) {
  const button = $('#' + kind);
  button.addEventListener('pointerdown', event => { event.preventDefault(); queueAction(runtime, 0, kind, event.timeStamp); });
  button.addEventListener('click', event => { if (event.detail === 0) queueAction(runtime, 0, kind, event.timeStamp); });
}
for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return;
    button.setPointerCapture(event.pointerId);
    pointerDirections.set(event.pointerId, Number(button.dataset.direction)); directionInput(0, event.timeStamp);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => {
    if (pointerDirections.delete(event.pointerId)) directionInput(0, event.timeStamp);
  });
}
window.addEventListener('keydown', event => {
  if (!matchStarted) return;
  if (dialog && event.code === 'Tab') {
    const buttons = [$('#resume'), $('#dialog-restart')].filter(button => !button.hidden);
    const current = buttons.indexOf(document.activeElement);
    buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    event.preventDefault(); return;
  }
  if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
  const binding = bindings[event.code];
  if (binding) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyR') { restart(); return; }
  if (event.code === 'Escape') { setPaused(!runtime.paused); return; }
  if (event.code === 'KeyH' || event.key === '?') { setPaused(true); return; }
  if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return;
  if (!binding) return;
  if (binding[0] === 'action') queueAction(runtime, binding[1], binding[2], event.timeStamp);
  else { held[binding[1]].add(event.code); directionInput(binding[1], event.timeStamp); }
});
window.addEventListener('keyup', event => {
  for (let fighter = 0; fighter < held.length; fighter++) {
    if (held[fighter].delete(event.code)) directionInput(fighter, event.timeStamp);
  }
});
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

function pollController(time) {
  let gamepads = [];
  let available = typeof navigator.getGamepads === 'function';
  if (available) {
    try { gamepads = navigator.getGamepads(); }
    catch { available = false; }
  }
  const result = controller.poll(gamepads, time, {
    started: matchStarted, ready: assetsReady, paused: runtime.paused,
    ended: runtime.world.status === 'ended', focused: document.hasFocus() && !document.hidden, mode: runtime.mode,
  });
  const slots = result.slots.map((slot, index) => matchStarted && runtime.mode === 'bot' && index === 1 ? 'P2: AI (second controller idle)' : `P${index + 1}: ${!slot.connected ? 'keyboard available · optional pad' : !slot.armed ? 'keyboard available · release pad buttons' : 'keyboard + controller ready'}`).join(' · ');
  const status = !available ? 'Controller access unavailable. Keyboard controls work in both modes; touch controls P1.'
    : `${slots}${result.unsupported ? ' · Unrecognized layout: browser standard mapping required.' : ''}${matchStarted ? ' · Start / Options pauses or resumes.' : ' · D-pad ↑ Bot / ↓ PvP; bottom face confirms.'}`;
  for (const element of document.querySelectorAll('[data-controller-status]')) if (element.textContent !== status) element.textContent = status;
  if (!matchStarted) {
    startButton.setAttribute('aria-pressed', String(result.selectedMode === 'bot'));
    pvpButton.setAttribute('aria-pressed', String(result.selectedMode === 'pvp'));
  }
  if (result.command) {
    if (result.command === 'start') startMatch(result.selectedMode);
    else if (result.command === 'restart') restart();
    else setPaused(result.command === 'pause');
    return;
  }
  for (const direction of result.directions) {
    controllerDirections[direction.fighter] = direction.value;
    directionInput(direction.fighter, direction.at);
  }
  for (const action of result.actions) queueAction(runtime, action.fighter, action.kind, action.at);
}

renderer.setAnimationLoop(time => {
  pollController(time);
  frameRuntime(runtime, time);
  const world = runtime.world;
  if (world.status === 'ended' && dialog !== 'result') { clearInput(); showDialog('result'); }
  const alpha = runtime.ready && !runtime.paused && world.status === 'playing' ? runtime.alpha : 1;
  const shown = renderFighters(world, alpha);
  for (const rig of rigs) {
    const { x, fighter } = shown[rig.index];
    rig.update(x, fighter); silks[rig.index].update(rig, fighter);
  }
  webEffects.update(world, shown.map(item => item.fighter), alpha);
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
    button.classList.toggle('pressed', !feedback.movementDisabled && runtime.controls[0].direction === Number(button.dataset.direction));
  }
  renderer.render(scene, camera);
});
if (import.meta.env.DEV) window.__spiderDerby = {
  getState: () => ({ ...structuredClone(runtime.world), paused: runtime.paused, ready: runtime.ready, mode: runtime.mode, matchStarted, assetsReady, loadedModels: rigs.length }), rules: { ...RULES, ...COMBAT },
  inspectScene: () => ({ stick: STICK, rigs: rigs.map(inspectRig), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
};
