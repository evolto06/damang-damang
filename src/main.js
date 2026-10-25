import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RULES } from './movement.js';
import { COMBAT } from './combat.js';
import { createAI, decideAI } from './ai.js';
import {
  createRuntime,
  clearActions,
  setReady,
  queueAction,
  queueDirection,
  pauseRuntime,
  restartRuntime,
  frameRuntime,
} from './runtime.js';
import './style.css';
import { createGameAudio } from './audio.js';
import { createStreet, createHeldStick, STICK } from './scene.js';
import { createSpiderRig, inspectRig } from './spider-rig.js';
import { fightFeedback, hintsFor, keysFor } from './feedback.js';
import { fitPlayCamera, followCameraFocus } from './camera.js';
import { createWebEffects } from './web-effects.js';
import { createSilkLine } from './silk.js';
import { createControllerInput, combinedDirection } from './controller.js';
import {
  createSeries,
  scoreRound,
  nextSeriesRound,
  createCoaching,
  coachingHint,
} from './match-flow.js';
import { createImpactFeedback, updateImpactFeedback } from './impact-feedback.js';

const elements = new Map(
  [...document.querySelectorAll('[id]')].map((element) => ['#' + element.id, element]),
);
const $ = (selector) => elements.get(selector);
const directionButtons = [...document.querySelectorAll('[data-direction]')];
const controllerStatuses = [...document.querySelectorAll('[data-controller-status]')];
const setText = (element, value) => {
  if (element.textContent !== value) element.textContent = value;
};
const setAttribute = (element, name, value) => {
  value = String(value);
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};
const setStyle = (element, name, value) => {
  if (element.style[name] !== value) element.style[name] = value;
};
const touchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const inputSources = [touchDevice ? 'touch' : 'keyboard', touchDevice ? 'touch' : 'keyboard'];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let touchPvp = touchDevice,
  coachingFinished = false;
try {
  coachingFinished = localStorage.getItem('damang-coaching-done') === 'on';
} catch {}
$('#coaching-choice').checked = !coachingFinished;
$('#touch-pvp').checked = touchPvp;
$('#touch-pvp').addEventListener('change', (event) => {
  clearInput();
  touchPvp = event.target.checked;
  updateTouchLayout();
  if (assetsReady) pvpButton.disabled = touchDevice && !touchPvp && connectedPads === 0;
  resize();
});
const audio = createGameAudio();
let hintsEnabled = true;
try {
  hintsEnabled = localStorage.getItem('damang-button-hints') !== 'off';
  audio.setMuted(localStorage.getItem('damang-muted') === 'on');
} catch {}
$('#button-hints').checked = hintsEnabled;
$('#button-hints').addEventListener('change', (event) => {
  hintsEnabled = event.target.checked;
  try {
    localStorage.setItem('damang-button-hints', hintsEnabled ? 'on' : 'off');
  } catch {}
});
function updateMute() {
  setAttribute($('#mute'), 'aria-pressed', audio.muted);
  setText($('#mute'), audio.muted ? 'Unmute sound' : 'Mute sound');
}
updateMute();
$('#mute').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  audio.unlock();
  updateMute();
  try {
    localStorage.setItem('damang-muted', audio.muted ? 'on' : 'off');
  } catch {}
});
const canvas = $('#scene');
const BINDS = {
  bot: {
    KeyA: ['move', 0, -1],
    KeyD: ['move', 0, 1],
    ArrowLeft: ['move', 0, -1],
    ArrowRight: ['move', 0, 1],
    KeyJ: ['action', 0, 'bite'],
    KeyK: ['action', 0, 'shoot'],
    KeyS: ['action', 0, 'drop'],
    ArrowDown: ['action', 0, 'drop'],
    KeyC: ['action', 0, 'web'],
    ShiftLeft: ['action', 0, 'dash'],
    ShiftRight: ['action', 0, 'dash'],
    Space: ['action', 0, 'dash'],
  },
  pvp: {
    KeyA: ['move', 0, -1],
    KeyD: ['move', 0, 1],
    KeyS: ['action', 0, 'drop'],
    KeyW: ['action', 0, 'web'],
    KeyQ: ['action', 0, 'bite'],
    KeyE: ['action', 0, 'shoot'],
    KeyF: ['action', 0, 'dash'],
    ArrowLeft: ['move', 1, -1],
    ArrowRight: ['move', 1, 1],
    ArrowDown: ['action', 1, 'drop'],
    ArrowUp: ['action', 1, 'web'],
    Comma: ['action', 1, 'bite'],
    Period: ['action', 1, 'shoot'],
    Slash: ['action', 1, 'dash'],
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
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (error) {
  launchError(
    'The game needs WebGL to run. Try a browser with hardware acceleration enabled, then reload.',
  );
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
const runtime = createRuntime({
  createOpponent: createAI,
  decideOpponent: decideAI,
});
const held = [new Set(), new Set()];
const pointerDirections = new Map();
const controller = createControllerInput();
let connectedPads = 0;
const controllerDirections = [0, 0];
runtime.inputSources = inputSources;
const cameraFocus = { x: 0, halfSpan: 6.3 };
let viewWidth = canvas.clientWidth,
  viewHeight = canvas.clientHeight,
  previousFrame = null;
let markerTop = 180;
let sceneDirty = true,
  lastDrawWorld = null,
  lastDrawTick = -1;
let resultAt = null;
let series = createSeries(),
  impactState = createImpactFeedback();
const damageElements = new Map();
const markers = [$('#player-marker'), $('#opponent-marker')].map((element) => ({
  element,
  name: element.firstElementChild,
  hint: element.lastElementChild,
  height: 0,
}));
const markerPoint = new THREE.Vector3();
const healthUI = ['player', 'opponent'].map((prefix) => ({
  hp: $('#' + prefix + '-hp'),
  health: $('#' + prefix + '-health'),
  fill: $('#' + prefix + '-health').firstElementChild,
  phase: $('#' + prefix + '-phase'),
}));
const actionUI = Object.fromEntries(
  ['shoot', 'bite', 'dash', 'drop', 'web'].map((kind) => [
    kind,
    {
      button: $('#' + kind),
      caption: $('#' + kind + '-status'),
      label: $('#' + kind).querySelector('strong').textContent,
    },
  ]),
);
let rigs = [];
let silks = [];
let dialog = null;
const assetStatus = $('#asset-status');
new GLTFLoader().load(
  import.meta.env.BASE_URL + 'models/spider.glb',
  (gltf) => {
    rigs = [createSpiderRig(gltf.scene, 0), createSpiderRig(gltf.scene, 1)];
    for (const rig of rigs) heldStickRoot.add(rig.root);
    silks = rigs.map(() => createSilkLine(heldStickRoot));
    silks.forEach((silk) => silk.setResolution(canvas.clientWidth, canvas.clientHeight));
    clearInput();
    assetsReady = true;
    sceneDirty = true;
    if (window.__damangBoot) window.__damangBoot.ready = true;
    startButton.disabled = false;
    pvpButton.disabled = touchDevice && !touchPvp && connectedPads === 0;
    startStatus.textContent = 'Ready when you are. Choose Bot Match or PvP to begin.';
    startStatus.dataset.state = 'ready';
    assetStatus.hidden = true;
  },
  undefined,
  (error) => {
    console.error('Spider model could not be loaded:', error);
    launchError('The spiders could not load. Check your connection and reload to try again.');
  },
);
function updateTouchLayout() {
  const enabled = matchStarted && runtime.mode === 'pvp' && touchPvp;
  $('#game').classList.toggle('touch-pvp', enabled);
  $('#p2-controls').hidden = !enabled;
}
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
  $('#shoot').setAttribute(
    'aria-label',
    `Shoot a web to briefly stun the opponent. ${pvp ? 'E' : 'K'}`,
  );
  $('#bite').setAttribute('aria-label', `Bite. ${pvp ? 'Q' : 'J'}`);
  $('#dash').setAttribute('aria-label', `Lunge. ${pvp ? 'F' : 'Shift or Space'}`);
  $('#drop').setAttribute('aria-label', `Drop from the stick. ${pvp ? 'S' : 'Down arrow or S'}`);
  $('#web').setAttribute('aria-label', `Shoot silk and return to the stick. ${pvp ? 'W' : 'C'}`);
  updateTouchLayout();
}
function startMatch(mode) {
  if (navigator.userActivation?.isActive) audio.unlock();
  controller.selectMode(mode);
  if (
    !assetsReady ||
    matchStarted ||
    (mode === 'pvp' && touchDevice && !touchPvp && connectedPads === 0)
  )
    return;
  matchStarted = true;
  runtime.mode = mode;
  series = createSeries();
  impactState = createImpactFeedback();
  runtime.coaching = mode === 'bot' ? createCoaching($('#coaching-choice').checked) : null;
  restartRuntime(runtime, performance.now(), $('#stage-choice').value);
  heldStickRoot.setStage(runtime.world.stage);
  setText($('#stage-name'), runtime.world.stage.name);
  cameraFocus.x = (runtime.world.fighters[0].x + runtime.world.fighters[1].x) / 2;
  cameraFocus.halfSpan = 6.3;
  resultAt = null;
  audio.reset();
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
  resize();
  canvas.focus({ preventScroll: true });
}
startButton.addEventListener('click', () => startMatch('bot'));
pvpButton.addEventListener('click', () => startMatch('pvp'));
function clearInput() {
  for (const keys of held) keys.clear();
  pointerDirections.clear();
  controllerDirections.fill(0);
  controller.reset();
  clearActions(runtime);
}
// Simulation ticks at a fixed 60 Hz; the renderer blends the last two ticks so
// movement stays smooth on monitors that do not refresh on tick boundaries.
function renderFighters(world, alpha) {
  return world.fighters.map((fighter, index) => {
    const from = world.previous?.[index] ?? { x: fighter.x, y: fighter.air.y };
    const x = from.x + (fighter.x - from.x) * alpha;
    const y = from.y + (fighter.air.y - from.y) * alpha;
    return {
      x,
      fighter:
        x === fighter.x && y === fighter.air.y
          ? fighter
          : { ...fighter, x, air: { ...fighter.air, y } },
    };
  });
}
function directionInput(fighter, timestamp) {
  let keyboard = 0;
  for (const code of held[fighter]) keyboard += bindings[code]?.[2] ?? 0;
  const touch = [...pointerDirections.values()]
    .filter((pointer) => pointer.fighter === fighter)
    .reduce((sum, pointer) => sum + pointer.value, 0);
  queueDirection(
    runtime,
    fighter,
    combinedDirection(keyboard, touch, controllerDirections[fighter]),
    timestamp,
  );
}
function showDialog(kind) {
  dialog = kind;
  $('#overlay').hidden = !kind;
  $('#pause').setAttribute('aria-label', kind ? 'Resume game' : 'Pause game');
  if (!kind) {
    canvas.focus({ preventScroll: true });
    return;
  }
  const result = kind === 'result';
  $('#button-hints').parentElement.hidden = result;
  $('#dialog-skip-coaching').hidden =
    result || !runtime.coaching || runtime.coaching.step === 'done';
  const pvp = runtime.mode === 'pvp';
  const winner = runtime.world.winner;
  const title =
    winner === 'draw'
      ? 'A draw. Replay this round.'
      : pvp
        ? winner === 'player'
          ? 'Panalo si P1.'
          : 'Panalo si P2.'
        : winner === 'player'
          ? 'Panalo! You win.'
          : 'Kalaban wins.';
  $('#dialog-title').textContent = result
    ? series.complete
      ? title.replace(/\.$/, '') + ' Match won.'
      : title
    : 'Fight paused.';
  $('#dialog-copy').textContent = result
    ? `Score ${series.wins[0]} – ${series.wins[1]}. ${series.complete ? 'First to two wins. Start a new match when you’re ready.' : winner === 'draw' ? 'Draws award no points. Replay to continue.' : 'First to two wins. Continue to the next round.'}${runtime.world.endReason === 'timeout' ? ' Time is up: higher health wins.' : ''}`
    : 'Take a moment. Resume when you’re ready.';
  $('#help-grid').hidden = result || pvp;
  $('#pvp-help').hidden = result || !pvp;
  $('#dialog-footnote').hidden = result || pvp;
  $('#dialog-restart').hidden = result;
  $('#resume').textContent = result
    ? series.complete
      ? 'New match →'
      : 'Next round →'
    : 'Tuloy / Resume →';
  $('#resume').setAttribute(
    'aria-label',
    result ? (series.complete ? 'Start new match' : 'Start next round') : 'Resume game',
  );
  if (result) $('#round-announcement').textContent = title;
  $('#resume').focus();
}
function setPaused(value) {
  if (!matchStarted) return;
  if (runtime.world.status === 'ended') return;
  clearInput();
  pauseRuntime(runtime, value);
  showDialog(value ? 'pause' : null);
}
function restart() {
  if (!matchStarted || (runtime.world.status === 'ended' && dialog !== 'result')) return;
  resultAt = null;
  audio.reset();
  series = createSeries();
  impactState = createImpactFeedback();
  clearInput();
  restartRuntime(runtime);
  $('#round-announcement').textContent = '';
  for (const rig of rigs) {
    rig.update(runtime.world.fighters[rig.index].x, runtime.world.fighters[rig.index]);
    silks[rig.index].update(rig, runtime.world.fighters[rig.index]);
  }
  showDialog(null);
}
function continueMatch() {
  if (series.complete) {
    restart();
    return;
  }
  if (!nextSeriesRound(series)) return;
  clearInput();
  restartRuntime(runtime);
  audio.reset();
  resultAt = null;
  impactState = createImpactFeedback();
  $('#round-announcement').textContent =
    `Round ${series.round}. Score ${series.wins.join(' to ')}.`;
  showDialog(null);
}
function finishCoaching() {
  if (runtime.coaching) runtime.coaching.step = 'done';
  coachingFinished = true;
  $('#coaching-choice').checked = false;
  try {
    localStorage.setItem('damang-coaching-done', 'on');
  } catch {}
}
$('#skip-coaching').addEventListener('click', finishCoaching);
$('#dialog-skip-coaching').addEventListener('click', () => {
  finishCoaching();
  $('#dialog-skip-coaching').hidden = true;
  $('#resume').focus();
});
function changeMode() {
  clearInput();
  setReady(runtime, false);
  audio.reset();
  resultAt = null;
  matchStarted = false;
  dialog = null;
  updateTouchLayout();
  $('#overlay').hidden = true;
  $('#start-screen').hidden = false;
  $('#game').classList.add('at-menu');
  $('#match-ui').inert = true;
  setAttribute($('#match-ui'), 'aria-hidden', 'true');
  canvas.tabIndex = -1;
  setAttribute(canvas, 'aria-hidden', 'true');
  $('#round-announcement').textContent = '';
  startButton.focus();
}
$('#change-mode').addEventListener('click', changeMode);
$('#pause').addEventListener('click', () => setPaused(!runtime.paused));
$('#resume').addEventListener('click', () =>
  runtime.world.status === 'ended' ? continueMatch() : setPaused(false),
);
$('#dialog-restart').addEventListener('click', restart);
$('#help').addEventListener('click', () => setPaused(true));
$('#reset').addEventListener('click', restart);
const actionButtons = [
  ...document.querySelectorAll('[data-action]'),
  ...['dash', 'bite', 'drop', 'web', 'shoot'].map((kind) => {
    const button = $('#' + kind);
    button.dataset.action = kind;
    return button;
  }),
];
for (const button of actionButtons) {
  const fighter = Number(button.dataset.fighter ?? 0),
    kind = button.dataset.action;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    audio.unlock();
    inputSources[fighter] = event.pointerType === 'touch' ? 'touch' : 'keyboard';
    queueAction(runtime, fighter, kind, event.timeStamp);
  });
  button.addEventListener('click', (event) => {
    if (event.detail === 0) queueAction(runtime, fighter, kind, event.timeStamp);
  });
}
for (const button of directionButtons) {
  const fighter = Number(button.dataset.fighter ?? 0);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return;
    audio.unlock();
    inputSources[fighter] = event.pointerType === 'touch' ? 'touch' : 'keyboard';
    button.setPointerCapture(event.pointerId);
    pointerDirections.set(event.pointerId, { fighter, value: Number(button.dataset.direction) });
    directionInput(fighter, event.timeStamp);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(type, (event) => {
      if (pointerDirections.delete(event.pointerId)) directionInput(fighter, event.timeStamp);
    });
}
function navigationTargets() {
  const container = !matchStarted ? $('#start-screen') : $('#overlay');
  return [...container.querySelectorAll('button, select, input')].filter(
    (element) =>
      !element.disabled && !element.closest('[hidden]') && element.getClientRects().length > 0,
  );
}
function navigateController(navigation) {
  const targets = navigationTargets();
  if (!targets.length) return;
  let active = document.activeElement;
  if (navigation.back) {
    if (dialog === 'pause') setPaused(false);
    else if (dialog === 'result') changeMode();
    return;
  }
  if (navigation.resume && dialog === 'pause') {
    setPaused(false);
    return;
  }
  if (!targets.includes(active)) {
    active = targets[0];
    active.focus();
  }
  if (navigation.move)
    active = targets[(targets.indexOf(active) + navigation.move + targets.length) % targets.length];
  if (navigation.adjust && active instanceof HTMLSelectElement) {
    active.selectedIndex =
      (active.selectedIndex + navigation.adjust + active.options.length) % active.options.length;
    active.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (navigation.adjust && !(active instanceof HTMLInputElement))
    active =
      targets[(targets.indexOf(active) + navigation.adjust + targets.length) % targets.length];
  active.focus();
  if (navigation.activate || (navigation.adjust && active instanceof HTMLInputElement)) {
    if (active instanceof HTMLSelectElement) {
      active.selectedIndex = (active.selectedIndex + 1) % active.options.length;
      active.dispatchEvent(new Event('change', { bubbles: true }));
    } else active.click();
  }
}
window.addEventListener('keydown', (event) => {
  if (!matchStarted) return;
  if (dialog && event.code === 'Tab') {
    const buttons = navigationTargets();
    const current = buttons.indexOf(document.activeElement);
    buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    event.preventDefault();
    return;
  }
  if (
    (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) &&
    event.code !== 'Escape'
  )
    return;
  if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
  const binding = bindings[event.code];
  if (binding) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyR') {
    restart();
    return;
  }
  if (event.code === 'Escape') {
    setPaused(!runtime.paused);
    return;
  }
  if (event.code === 'KeyH' || event.key === '?') {
    setPaused(true);
    return;
  }
  if (!runtime.ready || runtime.paused || runtime.world.status !== 'playing') return;
  if (!binding) return;
  audio.unlock();
  inputSources[binding[1]] = 'keyboard';
  if (binding[0] === 'action') queueAction(runtime, binding[1], binding[2], event.timeStamp);
  else {
    held[binding[1]].add(event.code);
    directionInput(binding[1], event.timeStamp);
  }
});
window.addEventListener('keyup', (event) => {
  for (let fighter = 0; fighter < held.length; fighter++) {
    if (held[fighter].delete(event.code)) directionInput(fighter, event.timeStamp);
  }
});
window.addEventListener('blur', () => {
  clearInput();
  setPaused(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInput();
    setPaused(true);
  }
});

function resize() {
  sceneDirty = true;
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  viewWidth = width;
  viewHeight = height;
  cameraFocus.bottomBand = 0;
  if (matchStarted && runtime.mode === 'pvp' && touchPvp) {
    const canvasTop = canvas.getBoundingClientRect().top;
    const panels = [$('#p1-controls'), $('#p2-controls')].filter(
      (panel) => !panel.hidden && panel.getClientRects().length,
    );
    if (panels.length)
      cameraFocus.bottomBand =
        height -
        Math.min(...panels.map((panel) => panel.getBoundingClientRect().top - canvasTop)) +
        12;
  }
  markerTop =
    document.querySelector('.fighters').getBoundingClientRect().bottom -
    canvas.getBoundingClientRect().top +
    12;
  markers.forEach((marker) => {
    marker.height = 0;
  });
  renderer.setSize(width, height, false);
  fitPlayCamera(camera, width, height, cameraFocus);
  silks.forEach((silk) => silk.setResolution(width, height));
}
window.addEventListener('resize', resize);
resize();

function pollController(time) {
  let gamepads = [];
  let available = typeof navigator.getGamepads === 'function';
  if (available) {
    try {
      gamepads = navigator.getGamepads();
    } catch {
      available = false;
    }
  }
  const result = controller.poll(gamepads, time, {
    started: matchStarted,
    ready: assetsReady,
    paused: runtime.paused,
    ended: matchStarted && runtime.world.status === 'ended',
    focused: document.hasFocus() && !document.hidden,
    mode: runtime.mode,
    navigation: !matchStarted ? 'menu' : dialog,
  });
  const count = result.slots.filter((slot) => slot.connected).length;
  if (count !== connectedPads) {
    connectedPads = count;
    controllerDirections.fill(0);
    for (let index = 0; index < 2; index++) directionInput(index, time);
    controller.reset();
    result.actions = [];
    result.directions = [];
  }
  const lonePadSlot = result.slots.findIndex((slot) => slot.connected);
  const fighterSlot = (slot) => (runtime.mode === 'pvp' && count === 1 ? 1 : slot);
  if (assetsReady) pvpButton.disabled = touchDevice && !touchPvp && count === 0;
  setText(
    $('#pvp-note'),
    touchDevice && !touchPvp && count === 0
      ? 'Enable two-player touch or connect a controller for P2'
      : count === 1
        ? 'One pad plays P2 · Keyboard / touch plays P1'
        : touchPvp
          ? 'Two touch sets · Keyboard · Controllers'
          : 'Split keyboard · Optional controllers',
  );
  const slots = result.slots
    .map((slot, index) =>
      matchStarted && runtime.mode === 'bot' && index === 1
        ? 'P2: AI (second controller idle)'
        : `P${fighterSlot(index) + 1}: ${!slot.connected ? 'keyboard available' : !slot.armed ? 'release pad buttons' : 'controller ready'}`,
    )
    .filter((_, index) => count !== 1 || index === lonePadSlot)
    .join(' · ');
  const status = !available
    ? 'Controller access unavailable. Keyboard and touch controls work in both modes.'
    : `${slots}${result.unsupported ? ' · Unrecognized layout: browser standard mapping required.' : ''}${matchStarted ? ' · Start / Options pauses or resumes.' : ' · D-pad navigates; ← / → adjusts; bottom confirms.'}`;
  for (const element of controllerStatuses)
    if (element.textContent !== status) element.textContent = status;
  if (result.navigation) {
    navigateController(result.navigation);
    return;
  }
  if (result.command) {
    if (result.command === 'start') startMatch(result.selectedMode);
    else if (result.command === 'restart') restart();
    else setPaused(result.command === 'pause');
    return;
  }
  for (const direction of result.directions) {
    const fighter = fighterSlot(direction.fighter);
    if (direction.value) inputSources[fighter] = 'controller';
    controllerDirections[fighter] = direction.value;
    directionInput(fighter, direction.at);
  }
  for (const action of result.actions) {
    const fighter = fighterSlot(action.fighter);
    inputSources[fighter] = 'controller';
    queueAction(runtime, fighter, action.kind, action.at);
  }
}

renderer.setAnimationLoop((time) => {
  pollController(time);
  frameRuntime(runtime, time);
  const world = runtime.world;
  if (matchStarted && world.status === 'ended' && dialog !== 'result') {
    if (resultAt === null) {
      scoreRound(series, world.winner);
      resultAt = time + 1000;
      clearInput();
    }
    if (time >= resultAt) showDialog('result');
  }
  const alpha = runtime.ready && !runtime.paused && world.status === 'playing' ? runtime.alpha : 1;
  const shown = renderFighters(world, alpha);
  for (const rig of rigs) {
    const { x, fighter } = shown[rig.index];
    rig.update(x, matchStarted ? fighter : { ...fighter, idleBounce: undefined });
    silks[rig.index].update(rig, fighter);
  }
  webEffects.update(
    world,
    shown.map((item) => item.fighter),
    alpha,
  );
  const delta = previousFrame === null ? 0 : Math.min(0.1, (time - previousFrame) / 1000);
  previousFrame = time;
  if (matchStarted && !runtime.paused && world.status === 'playing') {
    followCameraFocus(
      cameraFocus,
      shown.map((item) => item.fighter),
      world.stage,
      delta,
    );
  }
  fitPlayCamera(camera, viewWidth, viewHeight, cameraFocus);
  const impacts = updateImpactFeedback(impactState, world.fighters, delta, {
    paused: runtime.paused || !matchStarted,
    reducedMotion: reducedMotion.matches,
  });
  // Render-only offset: never write shake into camera focus or simulation.
  camera.position.x += impacts.shake.x;
  camera.position.y += impacts.shake.y;
  camera.updateMatrixWorld();
  const feedback = fightFeedback(runtime);
  const coaching =
    matchStarted && !runtime.paused && !dialog && world.status === 'playing'
      ? coachingHint(runtime.coaching, keysFor(runtime.mode, 0, inputSources[0]))
      : null;
  $('#coaching-panel').hidden = !coaching;
  if (coaching) setText($('#coaching-copy'), coaching.text);
  if (runtime.coaching?.step === 'done' && !coachingFinished) finishCoaching();
  setText($('#fight-prompt'), coaching?.text ?? feedback.prompt);
  setText($('#series-round'), `Round ${series.round}`);
  for (const [index, prefix] of ['player', 'opponent'].entries()) {
    const score = $('#' + prefix + '-score');
    setText(score, [0, 1].map((point) => (point < series.wins[index] ? '●' : '○')).join(' '));
    setAttribute(
      score,
      'aria-label',
      `${index ? 'P2' : 'P1'} round wins: ${series.wins[index]} of 2`,
    );
    healthUI[index].health.classList.toggle('hit-flash', impacts.flashes[index]);
  }
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
  const chosenHints = world.fighters.map((_, index) =>
    hintsEnabled &&
    matchStarted &&
    !runtime.paused &&
    !dialog &&
    (index === 0 || runtime.mode === 'pvp')
      ? hintsFor(world, index, runtime.mode, inputSources[index])
      : [],
  );
  if (coaching && hintsEnabled) chosenHints[0] = [coaching];
  for (const button of actionButtons.filter((button) => button.dataset.fighter === '1')) {
    const state = fightFeedback(runtime, 1).actions[button.dataset.action];
    button.disabled = state.disabled;
    button.classList.toggle(
      'hint-active',
      inputSources[1] === 'touch' &&
        chosenHints[1].some((hint) => hint.action === button.dataset.action),
    );
    setAttribute(button, 'title', state.caption);
  }
  for (const [kind, state] of Object.entries(feedback.actions)) {
    const ui = actionUI[kind];
    if (ui.button.disabled !== state.disabled) ui.button.disabled = state.disabled;
    setText(ui.caption, state.caption);
    const readyCaption = String(!state.disabled);
    if (ui.caption.dataset.ready !== readyCaption) ui.caption.dataset.ready = readyCaption;
    setAttribute(
      ui.button,
      'title',
      state.disabled ? `${ui.label}: ${state.caption}` : ui.button.getAttribute('aria-label'),
    );
    ui.button.classList.toggle(
      'hint-active',
      inputSources[0] === 'touch' && chosenHints[0].some((hint) => hint.action === kind),
    );
  }
  $('#dash').classList.toggle('cooling', feedback.cooling);
  setStyle($('#cooldown'), 'width', `${100 * (1 - player.cooldown / RULES.dashCooldown)}%`);
  for (const button of directionButtons) {
    const index = Number(button.dataset.fighter ?? 0),
      state = index ? fightFeedback(runtime, index) : feedback;
    if (button.disabled !== state.movementDisabled) button.disabled = state.movementDisabled;
    button.classList.toggle(
      'pressed',
      !state.movementDisabled &&
        runtime.controls[index].direction === Number(button.dataset.direction),
    );
    const clearDirection = world.fighters[index].air.clearDirection ?? 0;
    button.classList.toggle(
      'hint-active',
      inputSources[index] === 'touch' &&
        chosenHints[index].some((hint) => hint.action === 'move') &&
        (!clearDirection || clearDirection === Number(button.dataset.direction)),
    );
  }
  heldStickRoot.updateMatrixWorld(true);
  const close = Math.abs(shown[0].x - shown[1].x) < 2.8;
  for (const [index, marker] of markers.entries()) {
    marker.element.hidden = !matchStarted || !!dialog;
    if (marker.element.dataset.input !== inputSources[index])
      marker.element.dataset.input = inputSources[index];
    const hintText = chosenHints[index].map((hint) => hint.text).join(' · ');
    if (marker.hint.textContent !== hintText) marker.height = 0;
    setText(marker.hint, hintText);
    const air = shown[index].fighter.air;
    // Guidance stays above the current or return stick, including during a fall.
    markerPoint.set(
      shown[index].x,
      (air.mode === 'attached' ? air.y : (air.targetY ?? 0)) + 0.48,
      0,
    );
    heldStickRoot.localToWorld(markerPoint);
    markerPoint.project(camera);
    const x = Math.max(
      94,
      Math.min(
        viewWidth - 94,
        ((markerPoint.x + 1) * viewWidth) / 2 + (close ? (index === 0 ? -100 : 100) : 0),
      ),
    );
    const labelHeight = marker.height || (marker.height = marker.element.offsetHeight);
    // Separate close fighters horizontally, so neither label moves down across
    // the twig or the fighting silhouette on a short screen.
    const y = Math.max(markerTop + labelHeight, ((1 - markerPoint.y) * viewHeight) / 2);
    setStyle(
      marker.element,
      'transform',
      `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`,
    );
  }
  const aliveDamage = new Set();
  for (const impact of impacts.items) {
    aliveDamage.add(impact.id);
    let label = damageElements.get(impact.id);
    if (!label) {
      label = document.createElement('span');
      label.className = 'damage-label';
      label.textContent = `−${impact.damage}`;
      $('#damage-labels').append(label);
      damageElements.set(impact.id, label);
    }
    markerPoint.set(impact.x, impact.y + 0.25, 0);
    heldStickRoot.localToWorld(markerPoint);
    markerPoint.project(camera);
    const rise = reducedMotion.matches ? 0 : impact.age * 42;
    setStyle(
      label,
      'transform',
      `translate(${((markerPoint.x + 1) * viewWidth) / 2}px, ${((1 - markerPoint.y) * viewHeight) / 2 - rise}px) translate(-50%, -100%)`,
    );
    label.hidden = !matchStarted || !!dialog;
  }
  for (const [id, label] of damageElements)
    if (!aliveDamage.has(id)) {
      label.remove();
      damageElements.delete(id);
    }
  audio.update(world, { paused: runtime.paused || !matchStarted });
  // Frozen menus and pauses still poll controls without continuously redrawing
  // the same shadows. Active play keeps interpolation and idle animation live.
  if (
    sceneDirty ||
    world !== lastDrawWorld ||
    world.tick !== lastDrawTick ||
    (matchStarted && !runtime.paused && (world.status === 'playing' || impacts.items.length > 0))
  ) {
    renderer.render(scene, camera);
    sceneDirty = false;
    lastDrawWorld = world;
    lastDrawTick = world.tick;
  }
  camera.position.x -= impacts.shake.x;
  camera.position.y -= impacts.shake.y;
});
if (import.meta.env.DEV)
  window.__spiderDerby = {
    getState: () => ({
      ...structuredClone(runtime.world),
      series: structuredClone(series),
      coaching: structuredClone(runtime.coaching),
      paused: runtime.paused,
      ready: runtime.ready,
      mode: runtime.mode,
      matchStarted,
      assetsReady,
      loadedModels: rigs.length,
    }),
    rules: { ...RULES, ...COMBAT },
    inspectScene: () => ({
      stick: STICK,
      rigs: rigs.map(inspectRig),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fighterScreens: rigs.map((rig) => {
        const bounds = new THREE.Box3().setFromObject(rig.root, true);
        const top = new THREE.Vector3(
          bounds.getCenter(new THREE.Vector3()).x,
          bounds.max.y,
          0,
        ).project(camera);
        return { top: ((1 - top.y) * viewHeight) / 2 };
      }),
    }),
  };
