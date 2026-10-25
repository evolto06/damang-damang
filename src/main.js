import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RULES } from './movement.js';
import { COMBAT } from './combat.js';
import { createAI, decideAI } from './ai.js';
import { createRuntime, clearActions, setReady, queueAction, queueDirection, pauseRuntime, restartRuntime, frameRuntime } from './runtime.js';
import './style.css';
import { createGameAudio } from './audio.js';
import { createStreet, createHeldStick, STICK } from './scene.js';
import { createSpiderRig, inspectRig } from './spider-rig.js';
import { fightFeedback, hintsFor } from './feedback.js';
import { fitPlayCamera, followCameraFocus } from './camera.js';
import { createWebEffects } from './web-effects.js';
import { createSilkLine } from './silk.js';
import { createControllerInput, combinedDirection } from './controller.js';

const elements = new Map([...document.querySelectorAll('[id]')].map(element => ['#' + element.id, element]));
const $ = selector => elements.get(selector);
const directionButtons = [...document.querySelectorAll('[data-direction]')];
const controllerStatuses = [...document.querySelectorAll('[data-controller-status]')];
const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
const setAttribute = (element, name, value) => { value = String(value); if (element.getAttribute(name) !== value) element.setAttribute(name, value); };
const setStyle = (element, name, value) => { if (element.style[name] !== value) element.style[name] = value; };
const touchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const inputSources = [touchDevice ? 'touch' : 'keyboard', 'keyboard'];
const audio = createGameAudio();
let hintsEnabled = true;
try { hintsEnabled = localStorage.getItem('damang-button-hints') !== 'off'; audio.setMuted(localStorage.getItem('damang-muted') === 'on'); } catch {}
$('#button-hints').checked = hintsEnabled;
$('#button-hints').addEventListener('change', event => { hintsEnabled = event.target.checked; try { localStorage.setItem('damang-button-hints', hintsEnabled ? 'on' : 'off'); } catch {} });
function updateMute() { setAttribute($('#mute'), 'aria-pressed', audio.muted); setText($('#mute'), audio.muted ? 'Unmute sound' : 'Mute sound'); }
updateMute();
$('#mute').addEventListener('click', () => { audio.setMuted(!audio.muted); audio.unlock(); updateMute(); try { localStorage.setItem('damang-muted', audio.muted ? 'on' : 'off'); } catch {} });
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
  if (window.__damangBoot) window.__damangBoot.failed = true;
  startStatus.textContent = message;
  startStatus.dataset.state = 'error';
  startButton.disabled = true;
  pvpButton.disabled = true;
  $('#start-retry').hidden = false;
}
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
runtime.inputSources = inputSources;
const cameraFocus = { x: 0, halfSpan: 6.3 };
let viewWidth = canvas.clientWidth, viewHeight = canvas.clientHeight, previousFrame = null;
let markerTop = 180;
let resultAt = null;
const markers = [$('#player-marker'), $('#opponent-marker')].map(element => ({ element, name: element.firstElementChild, hint: element.lastElementChild }));
const markerPoint = new THREE.Vector3();
const healthUI = ['player', 'opponent'].map(prefix => ({ hp: $('#' + prefix + '-hp'), health: $('#' + prefix + '-health'), fill: $('#' + prefix + '-health').firstElementChild, phase: $('#' + prefix + '-phase') }));
const actionUI = Object.fromEntries(['shoot', 'bite', 'dash', 'drop', 'web'].map(kind => [kind, { button: $('#' + kind), caption: $('#' + kind + '-status'), label: $('#' + kind).querySelector('strong').textContent }]));
let rigs = [];
let silks = [];
let dialog = null;
const assetStatus = $('#asset-status');
new GLTFLoader().load(import.meta.env.BASE_URL + 'models/spider.glb', gltf => {
  rigs = [createSpiderRig(gltf.scene, 0), createSpiderRig(gltf.scene, 1)];
  for (const rig of rigs) heldStickRoot.add(rig.root);
  silks = rigs.map(() => createSilkLine(heldStickRoot));
  silks.forEach(silk => silk.setResolution(canvas.clientWidth, canvas.clientHeight));
  clearInput();
  assetsReady = true;
  if (window.__damangBoot) window.__damangBoot.ready = true;
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
  setText(markers[0].name, pvp ? 'P1' : 'Ikaw');
  setText(markers[1].name, pvp ? 'P2' : 'Kalaban');
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
  if (navigator.userActivation?.isActive) audio.unlock();
  controller.selectMode(mode);
  if (!assetsReady || matchStarted) return;
  matchStarted = true;
  runtime.mode = mode;
  restartRuntime(runtime, performance.now(), $('#stage-choice').value);
  heldStickRoot.setStage(runtime.world.stage);
  setText($('#stage-name'), runtime.world.stage.name);
  cameraFocus.x = (runtime.world.fighters[0].x + runtime.world.fighters[1].x) / 2;
  cameraFocus.halfSpan = 6.3;
  resultAt = null; audio.reset();
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
  $('#button-hints').parentElement.hidden = result;
  const pvp = runtime.mode === 'pvp';
  const winner = runtime.world.winner;
  const title = winner === 'draw' ? 'A draw.' : pvp ? (winner === 'player' ? 'Panalo si P1.' : 'Panalo si P2.') : (winner === 'player' ? 'Panalo! You win.' : 'Kalaban wins.');
  $('#dialog-title').textContent = result ? title : 'Fight paused.';
  $('#dialog-copy').textContent = result ? (runtime.world.endReason === 'timeout' ? 'Time is up. The spider with more health wins; equal health is a draw.' : 'The round is over. Start a fresh fight when you’re ready.') : 'Take a moment. Resume when you’re ready.';
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
  if (!matchStarted || (runtime.world.status === 'ended' && dialog !== 'result')) return;
  resultAt = null; audio.reset();
  clearInput(); restartRuntime(runtime); $('#round-announcement').textContent = '';
  for (const rig of rigs) { rig.update(runtime.world.fighters[rig.index].x, runtime.world.fighters[rig.index]); silks[rig.index].update(rig, runtime.world.fighters[rig.index]); }
  showDialog(null);
}
function changeMode() {
  clearInput(); setReady(runtime, false); audio.reset(); resultAt = null;
  matchStarted = false; dialog = null;
  $('#overlay').hidden = true; $('#start-screen').hidden = false;
  $('#game').classList.add('at-menu'); $('#match-ui').inert = true;
  setAttribute($('#match-ui'), 'aria-hidden', 'true');
  canvas.tabIndex = -1; setAttribute(canvas, 'aria-hidden', 'true');
  $('#round-announcement').textContent = ''; startButton.focus();
}
$('#change-mode').addEventListener('click', changeMode);
$('#pause').addEventListener('click', () => setPaused(!runtime.paused));
$('#resume').addEventListener('click', () => runtime.world.status === 'ended' ? restart() : setPaused(false));
$('#dialog-restart').addEventListener('click', restart);
$('#help').addEventListener('click', () => setPaused(true));
$('#reset').addEventListener('click', restart);
for (const kind of ['dash', 'bite', 'drop', 'web', 'shoot']) {
  const button = $('#' + kind);
  button.addEventListener('pointerdown', event => { event.preventDefault(); audio.unlock(); inputSources[0] = event.pointerType === 'touch' ? 'touch' : 'keyboard'; queueAction(runtime, 0, kind, event.timeStamp); });
  button.addEventListener('click', event => { if (event.detail === 0) queueAction(runtime, 0, kind, event.timeStamp); });
}
for (const button of directionButtons) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return;
    audio.unlock(); inputSources[0] = event.pointerType === 'touch' ? 'touch' : 'keyboard';
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
    const buttons = [$('#button-hints'), $('#mute'), $('#resume'), $('#dialog-restart'), $('#change-mode')].filter(button => !button.hidden && !button.parentElement.hidden);
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
  audio.unlock(); inputSources[binding[1]] = 'keyboard';
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
  viewWidth = width; viewHeight = height;
  markerTop = document.querySelector('.fighters').getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + 12;
  renderer.setSize(width, height, false);
  fitPlayCamera(camera, width, height, cameraFocus);
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
    ended: matchStarted && runtime.world.status === 'ended', focused: document.hasFocus() && !document.hidden, mode: runtime.mode,
  });
  const slots = result.slots.map((slot, index) => matchStarted && runtime.mode === 'bot' && index === 1 ? 'P2: AI (second controller idle)' : `P${index + 1}: ${!slot.connected ? 'keyboard available · optional pad' : !slot.armed ? 'keyboard available · release pad buttons' : 'keyboard + controller ready'}`).join(' · ');
  const status = !available ? 'Controller access unavailable. Keyboard controls work in both modes; touch controls P1.'
    : `${slots}${result.unsupported ? ' · Unrecognized layout: browser standard mapping required.' : ''}${matchStarted ? ' · Start / Options pauses or resumes.' : ' · D-pad ↑ Bot / ↓ PvP; bottom face confirms.'}`;
  for (const element of controllerStatuses) if (element.textContent !== status) element.textContent = status;
  if (!matchStarted) {
    setAttribute(startButton, 'aria-pressed', result.selectedMode === 'bot');
    setAttribute(pvpButton, 'aria-pressed', result.selectedMode === 'pvp');
  }
  if (result.command) {
    if (result.command === 'start') startMatch(result.selectedMode);
    else if (result.command === 'restart') restart();
    else setPaused(result.command === 'pause');
    return;
  }
  for (const direction of result.directions) {
    if (direction.value) inputSources[direction.fighter] = 'controller';
    controllerDirections[direction.fighter] = direction.value;
    directionInput(direction.fighter, direction.at);
  }
  for (const action of result.actions) { inputSources[action.fighter] = 'controller'; queueAction(runtime, action.fighter, action.kind, action.at); }
}

renderer.setAnimationLoop(time => {
  pollController(time);
  frameRuntime(runtime, time);
  const world = runtime.world;
  if (matchStarted && world.status === 'ended' && dialog !== 'result') {
    if (resultAt === null) { resultAt = time + 1000; clearInput(); }
    if (time >= resultAt) showDialog('result');
  }
  const alpha = runtime.ready && !runtime.paused && world.status === 'playing' ? runtime.alpha : 1;
  const shown = renderFighters(world, alpha);
  for (const rig of rigs) {
    const { x, fighter } = shown[rig.index];
    rig.update(x, matchStarted ? fighter : { ...fighter, idleBounce: undefined }); silks[rig.index].update(rig, fighter);
  }
  webEffects.update(world, shown.map(item => item.fighter), alpha);
  const delta = previousFrame === null ? 0 : Math.min(0.1, (time - previousFrame) / 1000); previousFrame = time;
  followCameraFocus(cameraFocus, shown.map(item => item.fighter), world.stage, delta);
  fitPlayCamera(camera, viewWidth, viewHeight, cameraFocus);
  const feedback = fightFeedback(runtime);
  setText($('#fight-prompt'), feedback.prompt);
  setText($('#round-time'), String(Math.ceil(world.remainingTicks / COMBAT.tickRate)));
  for (const [index, fighter] of world.fighters.entries()) {
    const ui = healthUI[index];
    setText(ui.hp, `${fighter.hp} / ${COMBAT.maxHealth}`);
    setAttribute(ui.health, 'aria-valuenow', fighter.hp);
    setStyle(ui.fill, 'width', `${fighter.hp}%`);
    setText(ui.phase, feedback.phases[index]);
    if (ui.phase.dataset.phase !== fighter.phase) ui.phase.dataset.phase = fighter.phase;
  }
  const player = world.fighters[0];
  const chosenHints = world.fighters.map((_, index) => hintsEnabled && matchStarted && !runtime.paused && !dialog && (index === 0 || runtime.mode === 'pvp') ? hintsFor(world, index, runtime.mode, inputSources[index]) : []);
  for (const [kind, state] of Object.entries(feedback.actions)) {
    const ui = actionUI[kind];
    if (ui.button.disabled !== state.disabled) ui.button.disabled = state.disabled;
    setText(ui.caption, state.caption);
    const readyCaption = String(!state.disabled);
    if (ui.caption.dataset.ready !== readyCaption) ui.caption.dataset.ready = readyCaption;
    setAttribute(ui.button, 'title', state.disabled ? `${ui.label}: ${state.caption}` : ui.button.getAttribute('aria-label'));
    ui.button.classList.toggle('hint-active', inputSources[0] === 'touch' && chosenHints[0].some(hint => hint.action === kind));
  }
  $('#dash').classList.toggle('cooling', feedback.cooling);
  setStyle($('#cooldown'), 'width', `${100 * (1 - player.cooldown / RULES.dashCooldown)}%`);
  for (const button of directionButtons) {
    if (button.disabled !== feedback.movementDisabled) button.disabled = feedback.movementDisabled;
    button.classList.toggle('pressed', !feedback.movementDisabled && runtime.controls[0].direction === Number(button.dataset.direction));
    const clearDirection = player.air.clearDirection ?? 0;
    button.classList.toggle('hint-active', inputSources[0] === 'touch' && chosenHints[0].some(hint => hint.action === 'move') && (!clearDirection || clearDirection === Number(button.dataset.direction)));
  }
  heldStickRoot.updateMatrixWorld(true);
  const close = Math.abs(shown[0].x - shown[1].x) < 2.8;
  let firstMarkerY = 0;
  for (const [index, marker] of markers.entries()) {
    marker.element.hidden = !matchStarted || !!dialog;
    if (marker.element.dataset.input !== inputSources[index]) marker.element.dataset.input = inputSources[index];
    setText(marker.hint, chosenHints[index].map(hint => hint.text).join(' · '));
    markerPoint.set(shown[index].x, 0.48, 0);
    heldStickRoot.localToWorld(markerPoint); markerPoint.project(camera);
    const x = Math.max(70, Math.min(viewWidth - 70, (markerPoint.x + 1) * viewWidth / 2));
    const labelHeight = marker.element.offsetHeight;
    // Keep both labels below the HUD; close fighters use distinct rows even at the clamp.
    const y = close && index === 1 ? firstMarkerY + labelHeight + 8 : Math.max(markerTop + labelHeight, (1 - markerPoint.y) * viewHeight / 2);
    if (index === 0) firstMarkerY = y;
    setStyle(marker.element, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`);
  }
  audio.update(world, { paused: runtime.paused || !matchStarted });
  renderer.render(scene, camera);
});
if (import.meta.env.DEV) window.__spiderDerby = {
  getState: () => ({ ...structuredClone(runtime.world), paused: runtime.paused, ready: runtime.ready, mode: runtime.mode, matchStarted, assetsReady, loadedModels: rigs.length }), rules: { ...RULES, ...COMBAT },
  inspectScene: () => ({ stick: STICK, rigs: rigs.map(inspectRig), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
};
