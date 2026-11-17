import * as THREE from 'three';
import { addEnemy, BUILD, createRun, enemyPose, flarePower, GUNS, inspectFlashlights, isSupply, LOOT,
  resolvePlayerBeam, setLoot, signalFlarePower, STEP, stepRun, traceAim } from './simulation.js';
import { createPresentation, loadArt } from './presentation.js';
import { CHUNK, clamp } from './world.js';
import { createAudio } from './audio.js';
import { createXR } from './xr.js';
import { formatTime, initials, listScores, loadSettings, rapidSeed, recordRun, saveSettings } from './records.js';
import { drawDebug } from './debug-map.js';
import { fillHelp } from './help.js';
import { createGunHandling, gunAngle, heldPose, legendaryBeamLabel, mountedAim, pistolLampAim,
  shotgunPumpTravel, toolLayouts } from './held-tools.js';
import { activeHordeLimit, ARSENAL_WAVES, DIFFICULTIES, MODES } from './difficulty.js';
import { RADIO_GUARANTEE, RADIO_REPLY } from './extraction.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const developer = typeof __DEVELOPMENT__ !== 'undefined' && __DEVELOPMENT__;
const debugEnabled = developer && qs.has('debug');
const showPerformance = qs.has('perf');
const touch = matchMedia('(pointer: coarse)').matches;
const settings = loadSettings();
const held = new Set(), queued = {};
const audio = createAudio();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(69, innerWidth / innerHeight, .044, 95);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group();
rig.add(camera); scene.add(rig);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.07;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(.91);
renderer.xr.setFoveation(1);
$('world').appendChild(renderer.domElement);
const canvas = renderer.domElement;
canvas.tabIndex = -1;
const xr = createXR(renderer, scene, rig);

const motionReplay = debugEnabled && qs.get('scenario') === 'motion';
const art = await loadArt(motionReplay && qs.get('version') === 'before');
const layouts = toolLayouts(art);
const presentation = createPresentation(scene, art, layouts);
const handling = createGunHandling();
const offhandHandling = createGunHandling();
$('start').disabled = false;
$('start').textContent = touch ? 'Start on this screen' : 'Enter the forest';
$('build').textContent = 'BUILD ' + BUILD;
$('status').textContent = '';
void xr.supported().then(ok => {
  $('vr').disabled = !ok;
  if (!ok) $('vr').title = 'Immersive VR is available in compatible headset browsers';
});

let phase = 'menu', run = createRun('Blackwater', { populate: false }), runId = '';
let resultNote = '', deathMessage = '', pauseReason = '';
let yaw = .20, pitch = -.026, roomX = 0, roomZ = 0;
let joystick = { x: 0, y: 0 }, desktopFire = false, touchFire = false, inspectDrag = false, dragDistance = 0;
let lastTime, accumulator = 0, manualClock = false, manualRemainder = 0, hudAt = -1, debugAt = -1;
let notice = '', noticeUntil = 0, headTrackedAt = 0, deathAt = 0, replyUntil = 0, panelKey = '', useMouseDrag = false;
let quality = 3, perfElapsed = 0, perfFrames = 0, stableWindows = 0, missed = 0, maxFrame = 0, perfSample = null;
const perfTimes = [];
let debugVisible = false;
let aimHit = null, offhandAimHit = null;
let shotgunFiredAt = -Infinity;
let calibrating = false;
const direction0 = new THREE.Vector3(0, 0, -1);
const vertical = new THREE.Vector3(0, 1, 0);
const text = (id, value) => { $(id).textContent = value; };
const objective = 'Follow the road. Search sheds for an extraction radio.';

function clearInput() {
  held.clear();
  for (const action of Object.keys(queued)) delete queued[action];
  desktopFire = touchFire = inspectDrag = false;
  joystick = { x: 0, y: 0 };
  roomX = roomZ = accumulator = 0;
  $('stick').firstElementChild.style.transform = '';
}

function setPhase(next) {
  phase = next;
  calibrating = false;
  handling.reset(run.player.weapon, !!xr.active);
  offhandHandling.reset('pistol');
  panelKey = '';
  const running = phase === 'playing', inspecting = phase === 'inspect', isXR = !!xr.active;
  document.body.classList.toggle('running', running);
  document.body.classList.toggle('inspecting', inspecting);
  document.body.classList.toggle('extracting', phase === 'extracting');
  $('shell').hidden = phase !== 'menu';
  $('hud').hidden = !running || isXR;
  $('touch').hidden = !(running || inspecting) || !touch || isXR;
  $('death-view').hidden = !inspecting || isXR;
  $('radio-reply').hidden = phase !== 'extracting' || isXR;
  $('pause').hidden = phase !== 'paused';
  $('results').hidden = phase !== 'results';
  $('debug').hidden = !running || !debugVisible || isXR;
  clearInput();
  audio.setPaused(!running);
}

function setNotice(message, duration = 2.4) {
  notice = message;
  noticeUntil = run.time + duration;
}

function pointerLock() {
  if (touch || xr.active || document.pointerLockElement === canvas) return;
  try {
    const request = canvas.requestPointerLock?.();
    request?.catch?.(() => {
      useMouseDrag = true;
      setNotice(run.time < 5 && !motionReplay ? objective + ' · Drag to look' : 'Click and drag to look', 5);
    });
    if (!canvas.requestPointerLock) useMouseDrag = true;
  } catch { useMouseDrag = true; }
}

function selectedSetup() {
  return { difficulty:settings.difficulty, legendary:settings.mode === 'legendary',
    arsenal:settings.mode === 'arsenal' ? { wave:settings.arsenalWave, weapon:settings.arsenalWeapon } : null };
}

function start(seed = rapidSeed(), setup = selectedSetup()) {
  useMouseDrag = false;
  const scenario = debugEnabled ? qs.get('scenario') : '';
  const encounter = ['roadside', 'night', 'shelter', 'motion', 'escape', 'lantern'].includes(scenario);
  run = createRun(encounter ? 'Blackwater' : seed, { ...setup, crowdLimit: xr.active ? 48 : touch ? 34 : 48,
    populate: !encounter });
  yaw = pitch = roomX = roomZ = 0;
  if (scenario === 'roadside') {
    addEnemy(run, 'shambler', -.55, 13.6);
    addEnemy(run, 'shrieker', 1.7, 10.2);
    addEnemy(run, 'brute', -.6, 8.4);
    setLoot(run, 'armor2', 1.5, 14.9);
    setLoot(run, 'shotgun', -1.7, 11.1);
  } else if (scenario === 'night') {
    Object.assign(run.player, { x: 3, z: 36, y: run.world.height(3, 36), yaw: Math.PI });
    yaw = Math.PI;
    addEnemy(run, 'shambler', 3, 42);
    const drop = setLoot(run, 'carbine', 2.55, 41);
    if (drop) drop.born = -26;
    if (!run.legendary) run.player.flashlight = false;
  } else if (scenario === 'shelter') {
    Object.assign(run.player, { x: 11.9, z: -12.8, y: run.world.height(11.9, -12.8), flashlight: run.legendary });
  } else if (scenario === 'lantern') {
    const world = run.world;
    const site = world.districtSites(0,-1).find(building => building.radio && building.lantern);
    const light = world.chunk(Math.floor(site.x/CHUNK),Math.floor(site.z/CHUNK)).lights.find(l => l.type === 'lantern');
    const sign = Math.sign(site.door.z-site.z);
    const viewpoints = [32,28,22,16,9].flatMap(gap => [0,-6,6,-12,12].map(dx => {
      const x = site.door.x+dx, z = site.door.z+sign*gap;
      return { x,z,y:world.height(x,z) };
    }));
    const point = viewpoints.find(p => !world.blocks(p.x,p.z,.4) && world.clear({ ...p,y:p.y+1.63 },light))
      ?? viewpoints.at(-1);
    yaw = Math.atan2(light.x-point.x,point.z-light.z);
    Object.assign(run.player,{ ...point,yaw,flashlight:run.legendary });
  } else if (scenario === 'escape') {
    const site = run.world.districtSites(0,-1).find(building => building.radio);
    const x = site.door.x, z = site.door.z + Math.sign(site.door.z-site.z)*1.7;
    yaw = Math.atan2(site.x-x,z-site.z);
    Object.assign(run.player,{ x,z,y:run.world.height(x,z),yaw });
    run.search.sheds = RADIO_GUARANTEE - 1;
  } else if (motionReplay) {
    const area = run.world.chunk(0,0);
    const tree = { x:1.05, z:14.7, y:run.world.height(1.05,14.7)-.12,
      r:.72, height:10.5, turn:0, tint:.38, type:1, kind:'bark',
      normals:Array.from({length:9}, (_, i) => ({x:Math.sin((i+.5)*Math.PI*2/9),z:Math.cos((i+.5)*Math.PI*2/9)})) };
    area.trees.push(tree);
    area.colliders.push(tree);
    const subject = addEnemy(run,'shambler', 1.15, 12.7);
    subject.approach = { x:0, z:19.17, at:0, until:30 };
    run.player.protection = 30;
    if (!run.legendary && qs.get('light') === 'moon') run.player.flashlight = false;
  }
  runId = rapidSeed();
  shotgunFiredAt = -Infinity;
  notice = '';
  hudAt = debugAt = -1;
  quality = 3;
  perfElapsed = perfFrames = stableWindows = missed = maxFrame = 0;
  perfTimes.length = 0;
  perfSample = null;
  presentation.setQuality(quality);
  audio.reset();
  void audio.unlock();
  setPhase('playing');
  if (!xr.active) pointerLock();
  const opening = motionReplay ? (art.legacyShambler ? 'Original shambler' : 'Rebuilt shambler') : objective;
  setNotice(opening, 5);
  updateHUD(true);
}

function rematch() {
  const { seed, difficulty, legendary, arsenal } = run;
  start(seed,{ difficulty, legendary, arsenal });
}

function pause(reason = 'The run is paused.') {
  if (phase !== 'playing') return;
  pauseReason = reason;
  text('pause-note', reason);
  setPhase('paused');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function resume() {
  if (phase !== 'paused') return;
  setPhase('playing');
  void audio.unlock();
  pointerLock();
}

function showHome() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  yaw = .20; pitch = -.026;
  run = createRun('Blackwater', { populate: false });
  setPhase('menu');
  showPanel('home');
}

function practiceLabel() {
  if (run.arsenal) return 'Arsenal Test · ' + DIFFICULTIES[run.difficulty].name + ' · Minute ' + run.arsenal.wave;
  if (run.legendary) return 'Legendary practice';
  return '';
}

function resultScore() {
  if (run.status !== 'dead' || motionReplay) return;
  const practice = practiceLabel();
  if (practice) {
    resultNote = practice + ' · Seed ' + run.seed;
    text('result-storage', resultNote);
    return;
  }
  const outcome = recordRun(run, runId, settings.initials);
  resultNote = outcome.saved ? outcome.place ? 'Local rank ' + outcome.place + ' · Seed ' + run.seed : 'Seed ' + run.seed
    : 'Browser storage is unavailable. Seed ' + run.seed;
  resultNote = DIFFICULTIES[run.difficulty].name + ' · ' + resultNote;
  text('result-storage', resultNote);
}

function inspectDeath() {
  if (phase !== 'playing') return;
  deathAt = performance.now();
  const { kind, yaw: angle } = run.death;
  const bearing = Math.abs(angle) < .60 ? 'ahead' : Math.abs(angle) > 2.35 ? 'behind you' : angle < 0 ? 'on your left' : 'on your right';
  deathMessage = 'A ' + kind + ' landed a hit ' + (bearing === 'ahead' ? 'from ahead' : bearing) + '.';
  fillResults('The light went out.', deathMessage, false);
  $('result-initials').value = settings.initials;
  resultScore();
  const p = run.player;
  p.battery = 1;
  if (p.offhand && !p.flashlight) p.beam = 'wide';
  p.flashlight = true;
  text('death-view-reason', deathMessage);
  text('death-view-controls', touch ? 'Drag to look · Aim with the light controls' : 'Drag to look · F / Q for light · Esc for results');
  lookAround();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function fillResults(title, description, escaped) {
  text('results-title', title);
  text('result-eyebrow', escaped ? 'EXTRACTION' : 'AFTER THE ATTACK');
  text('death-reason', description);
  text('result-time-label', escaped ? 'ESCAPE TIME' : 'SURVIVED');
  text('result-time', formatTime(run.time));
  text('result-kills', run.player.kills);
  text('result-heads', run.player.headshots);
  $('look-around').hidden = escaped;
  $('result-initials').parentElement.hidden = escaped || Boolean(practiceLabel());
}

function inspectEscape() {
  replyUntil = performance.now() + 3850;
  deathAt = 0;
  resultNote = [practiceLabel(), 'Seed ' + run.seed].filter(Boolean).join(' · ');
  text('radio-reply', RADIO_REPLY);
  text('result-storage', resultNote);
  fillResults('Escaped', RADIO_REPLY, true);
  setPhase('extracting');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function lookAround() {
  setPhase('inspect');
  if (!xr.active) $('show-results').focus();
}

function openResults() {
  setPhase('results');
  if (!xr.active) $('restart').focus();
}

let helpReady = false;
function showPanel(id) {
  const returningFromHelp = id === 'home' && !$('help').hidden;
  for (const panel of ['home', 'help', 'controls', 'scores', 'settings']) $(panel).hidden = panel !== id;
  $('shell').scrollTop = 0;
  if (id === 'help') {
    if (!helpReady) {
      fillHelp($('help'),presentation.pickupImage);
      helpReady = true;
    }
    $('help-title').focus({ preventScroll:true });
  }
  if (returningFromHelp) $('help-tab').focus({ preventScroll:true });
  if (id === 'scores') {
    $('score-difficulty').value = settings.difficulty;
    showScores();
  }
}

function showScores() {
  const target = $('score-table'), items = listScores($('score-difficulty').value);
  target.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'note'; empty.textContent = 'Finish a run to post the first score on this device.';
    target.append(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'records';
  const headings = table.createTHead().insertRow();
  for (const name of ['#', 'Player', 'Time', 'Kills', 'Headshots']) {
    const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = name; headings.append(cell);
  }
  const body = table.createTBody();
  for (const [i, row] of items.entries()) {
    const tr = body.insertRow();
    for (const part of [i + 1, row.initials, formatTime(row.time), row.kills, row.headshots]) tr.insertCell().textContent = part;
  }
  target.append(table);
}

function setRunOption(key, value) {
  settings[key] = value;
  for (const [id,option] of [['difficulty','difficulty'], ['game-mode','mode'],
    ['arsenal-wave','arsenalWave'], ['arsenal-weapon','arsenalWeapon']]) $(id).value = settings[option];
  $('arsenal-setup').hidden = settings.mode !== 'arsenal';
  panelKey = '';
  saveSettings(settings);
}

const difficultyOptions = Object.entries(DIFFICULTIES).map(([value,level]) => [value,level.name]);
const weaponOptions = Object.entries(GUNS).map(([value,gun]) => [value,gun.name]);
const runOptions = [
  ['difficulty','difficulty',difficultyOptions], ['game-mode','mode',Object.entries(MODES)],
  ['arsenal-wave','arsenalWave',ARSENAL_WAVES.map(wave => [wave,wave + ' min'])],
  ['arsenal-weapon','arsenalWeapon',weaponOptions],
];
for (const [id,key,options] of runOptions) {
  const menu = $(id);
  menu.replaceChildren(...options.map(([value,label]) => new Option(label,value)));
  menu.value = settings[key];
  menu.addEventListener('change', () => setRunOption(key, options[menu.selectedIndex][0]));
}
$('arsenal-setup').hidden = settings.mode !== 'arsenal';
$('score-difficulty').replaceChildren(...difficultyOptions.map(([value,label]) => new Option(label,value)));
$('score-difficulty').addEventListener('change', showScores);

function cycleRunOption(key) {
  const [, , options] = runOptions.find(([,option]) => option === key);
  const index = options.findIndex(([value]) => value === settings[key]);
  setRunOption(key, options[(index + 1) % options.length][0]);
}

for (const btn of document.querySelectorAll('[data-panel]')) btn.addEventListener('click', () => showPanel(btn.dataset.panel));
for (const btn of document.querySelectorAll('[data-back]')) btn.addEventListener('click', () => showPanel('home'));
for (const field of document.querySelectorAll('[data-setting]')) {
  const key = field.dataset.setting;
  if (field.type === 'checkbox') field.checked = settings[key]; else field.value = settings[key];
  field.addEventListener('input', () => {
    settings[key] = field.type === 'checkbox' ? field.checked : Number(field.value);
    saveSettings(settings);
    if (key === 'volume') audio.setVolume(settings.volume);
  });
}
function updateGunSettings(pitch, yaw) {
  settings.gunPitch = gunAngle(pitch);
  settings.gunYaw = gunAngle(yaw);
  for (const field of document.querySelectorAll('[data-angle]')) {
    const value = settings[field.dataset.angle];
    field.value = value;
    text(field.dataset.angle + '-value', value + '°');
  }
  $('sight-preview').style.transform = 'translate(' + -settings.gunYaw * 1.7 + 'px,' + -settings.gunPitch * 1.25 + 'px)';
  saveSettings(settings);
}
updateGunSettings(settings.gunPitch, settings.gunYaw);
for (const field of document.querySelectorAll('[data-angle]')) {
  field.addEventListener('input', () => {
    const values = { ...settings, [field.dataset.angle]: Number(field.value) };
    updateGunSettings(values.gunPitch, values.gunYaw);
  });
}
$('gun-angle-reset').addEventListener('click', () => updateGunSettings(0, 0));
audio.setVolume(settings.volume);
$('initials').value = settings.initials;
$('initials').addEventListener('change', event => {
  settings.initials = event.target.value = initials(event.target.value);
  saveSettings(settings);
});
$('result-initials').addEventListener('change', event => {
  settings.initials = event.target.value = initials(event.target.value);
  $('initials').value = settings.initials;
  saveSettings(settings);
  resultScore();
});
$('start').addEventListener('click', () => start(debugEnabled && qs.get('seed') || undefined));
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', showHome);
$('result-home').addEventListener('click', showHome);
$('show-results').addEventListener('click', openResults);
$('look-around').addEventListener('click', lookAround);
$('restart').addEventListener('click', () => start());
$('rematch').addEventListener('click', rematch);
$('vr').addEventListener('click', async () => {
  try {
    const session = xr.enter(state => { if (state !== 'visible') pause('Headset focus was interrupted.'); });
    void audio.unlock();
    await session;
  } catch (error) {
    text('status', 'VR could not start. Reopen this page in Quest Browser and try again.');
    console.warn('WebXR session:', error);
  }
});
renderer.xr.addEventListener('sessionstart', () => {
  document.body.classList.add('xr');
  xr.reset();
  headTrackedAt = performance.now();
  showHome();
});
renderer.xr.addEventListener('sessionend', () => {
  xr.finish();
  document.body.classList.remove('xr');
  showHome();
});

const keyboard = { KeyR: 'reload', Tab: 'cycleWeapon', KeyF: 'toggleLight', KeyQ: 'toggleBeam', KeyE: 'interact', Space: 'fire' };
document.addEventListener('keydown', event => {
  if (event.target.matches?.('input, textarea')) return;
  if (phase === 'playing') {
    held.add(event.code);
    if (keyboard[event.code] && !event.repeat) queued[keyboard[event.code]] = true;
    if (event.code === 'Escape') pause();
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
    if (debugEnabled && event.code === 'KeyM' && !event.repeat) {
      debugVisible = !debugVisible;
      $('debug').hidden = !debugVisible;
    }
  } else if (phase === 'inspect' && !event.repeat) {
    if (event.code === 'Escape' || event.code === 'Enter') {
      event.preventDefault();
      openResults();
    } else if (event.code === 'KeyF' || event.code === 'KeyQ') {
      inspectFlashlights(run, { [keyboard[event.code]]: true });
    }
  } else if (phase === 'paused' && event.code === 'Escape') resume();
  else if (phase === 'results' && event.code === 'Enter' && event.target.tagName !== 'BUTTON') start();
});
document.addEventListener('keyup', e => held.delete(e.code));
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) useMouseDrag = false;
  else if (phase === 'playing' && !touch && !xr.active && !useMouseDrag) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !xr.active) pause('The game window lost focus.');
});
window.addEventListener('blur', () => {
  clearInput();
  if (!xr.active) pause('The game window lost focus.');
});

function look(dx, dy, sensitivity = .00215) {
  yaw += dx * sensitivity;
  pitch = clamp(pitch - dy * sensitivity, -1.35, 1.35);
}

canvas.addEventListener('pointerdown', e => {
  if (xr.active || touch || e.button !== 0) return;
  if (phase === 'inspect') { inspectDrag = true; return; }
  if (phase !== 'playing') return;
  if (!useMouseDrag && document.pointerLockElement !== canvas) {
    pointerLock();
    if (!debugEnabled) return;
  }
  desktopFire = true;
  dragDistance = 0;
  if (!useMouseDrag) queued.fire = true;
});
document.addEventListener('pointerup', e => {
  if (e.button !== 0) return;
  if (phase === 'playing' && useMouseDrag && desktopFire && dragDistance < 7) queued.fire = true;
  desktopFire = false;
  inspectDrag = false;
});
document.addEventListener('mousemove', e => {
  if (phase === 'playing' && (document.pointerLockElement === canvas || (useMouseDrag && desktopFire))) {
    dragDistance += Math.hypot(e.movementX, e.movementY);
    look(e.movementX, e.movementY);
  } else if (phase === 'inspect' && inspectDrag) look(e.movementX, e.movementY);
});

let stickPointer = null, lookPointer = null, lastTouch = null;
const stick = $('stick'), pad = $('look-pad');
function moveStick(e) {
  const rect = stick.getBoundingClientRect();
  const x = (e.clientX - rect.x - rect.width / 2) / (rect.width * .40);
  const y = (e.clientY - rect.y - rect.height / 2) / (rect.height * .40);
  const mag = Math.max(1, Math.hypot(x, y));
  joystick = { x: x / mag, y: y / mag };
  stick.firstElementChild.style.transform = 'translate(' + joystick.x * 27 + 'px,' + joystick.y * 27 + 'px)';
}
stick.addEventListener('pointerdown', e => { stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) moveStick(e); });
stick.addEventListener('lostpointercapture', () => {
  stickPointer = null;
  joystick = { x: 0, y: 0 };
  stick.firstElementChild.style.transform = '';
});
pad.addEventListener('pointerdown', e => {
  if (lookPointer !== null) return;
  lookPointer = e.pointerId; pad.setPointerCapture(e.pointerId); lastTouch = { x: e.clientX, y: e.clientY };
});
pad.addEventListener('pointermove', e => {
  if (e.pointerId !== lookPointer || !lastTouch) return;
  look(e.clientX - lastTouch.x, e.clientY - lastTouch.y, .0044);
  lastTouch = { x: e.clientX, y: e.clientY };
});
pad.addEventListener('lostpointercapture', () => { lookPointer = null; });
for (const btn of document.querySelectorAll('[data-touch]')) {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    const action = btn.dataset.touch;
    if (phase === 'inspect') inspectFlashlights(run, { [action]: true });
    else if (action === 'pause') pause();
    else queued[action] = true;
  });
}
$('touch-fire').addEventListener('pointerdown', e => {
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  touchFire = true; queued.fire = true;
});
$('touch-fire').addEventListener('lostpointercapture', () => { touchFire = false; });

function desktopView() {
  const p = run.player;
  rig.rotation.set(0, 0, 0);
  rig.position.set(p.x, p.y, p.z);
  camera.position.set(0, 1.63, 0);
  camera.rotation.set(pitch, -yaw, 0);
  if (motionReplay && qs.get('view') === 'side' && phase === 'playing') {
    const subject = run.enemies[0] || run.corpses[0];
    if (subject) {
      camera.position.set(subject.x - p.x - 3.45, subject.y - p.y + 1.26, subject.z - p.z + .1);
      camera.lookAt(subject.x, subject.y + .94, subject.z);
    }
  }
  camera.updateWorldMatrix(true, false);
  const view = { position: camera.getWorldPosition(new THREE.Vector3()), quaternion: camera.getWorldQuaternion(new THREE.Quaternion()) };
  const sign = settings.leftHanded ? -1 : 1;
  const hold = (x, y, z, a, b) => ({
    position: camera.localToWorld(new THREE.Vector3(x, y, z)),
    quaternion: view.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(a,b,0))),
  });
  const span = touch ? .19 : .236;
  const long = p.weapon === 'shotgun' || p.weapon === 'carbine' ? -.63 : -.48;
  return { view, tracking: {
    weapon: hold(sign * span, -.323, long, .037, sign * .085),
    lamp: p.offhand ? hold(-sign * span, -.323, long, .037, -sign * .085)
      : hold(-sign * (span + .009), -.264, -.435, -.037, -sign * .072),
  } };
}

function trackedView(stereo, lead = 0) {
  const p = run.player, view = stereo ? xr.sync(p) : desktopView();
  const kind = p.weapon, layout = layouts[kind];
  view.tracking.weapon = heldPose(view.tracking.weapon, stereo);
  view.tracking.lamp = heldPose(view.tracking.lamp, stereo);
  const pumpTravel = kind === 'shotgun' && !calibrating
    ? shotgunPumpTravel(run.time + lead - shotgunFiredAt, p.reload) : 0;
  view.tracking = handling.resolve(view.tracking, layout, view.view, settings, stereo, calibrating,
    lead, rig.quaternion, pumpTravel);
  view.tracking.pumpTravel = pumpTravel;
  view.aim = mountedAim(view.tracking.weapon, layout, view.view);
  if (p.offhand) {
    const second = offhandHandling.resolve({ weapon: view.tracking.lamp }, layout, view.view, settings, stereo, false, lead);
    view.tracking.offhand = second.weapon;
    view.tracking.offhandKick = second.gunKick;
    view.offhandAim = mountedAim(second.weapon, layout, view.view);
    view.beam = pistolLampAim(view.tracking.weapon, layouts.pistolLamp, view.view, p.reload, settings.leftHanded);
    view.offhandBeam = pistolLampAim(second.weapon, layouts.pistolLamp, view.view, p.offhand.reload, !settings.leftHanded);
  } else view.beam = mountedAim(view.tracking.lamp, layouts.flashlight, view.view);
  return view;
}

function desktopInput() {
  const x = Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft')) + joystick.x;
  const y = Number(held.has('KeyS') || held.has('ArrowDown')) - Number(held.has('KeyW') || held.has('ArrowUp')) + joystick.y;
  return { yaw, pitch, moveX: Math.cos(yaw) * x - Math.sin(yaw) * y,
    moveZ: Math.sin(yaw) * x + Math.cos(yaw) * y,
    walk: held.has('ShiftLeft') || held.has('ShiftRight') || (touch && Math.hypot(joystick.x, joystick.y) < .48),
    fireHeld: (!useMouseDrag && desktopFire) || touchFire || held.has('Space') };
}

function handleEvent(batch) {
  audio.events(batch, run);
  presentation.events(batch);
  for (const event of batch) {
    if (event.type === 'dry') setNotice(event.reason, 1.25);
    else if (event.type === 'pickup') setNotice(event.message);
    else if (event.type === 'extraction') inspectEscape();
    else if (event.type === 'weaponSwitch') setNotice(GUNS[event.weapon].name, 1.25);
    else if (event.type === 'light' && event.empty) setNotice('Battery depleted. Recharging.');
    else if (event.type === 'shot') {
      if (event.weapon === 'shotgun') shotgunFiredAt = run.time;
      if (event.offhand) offhandHandling.kick(!settings.leftHanded);
      else handling.kick(settings.leftHanded);
      xr.haptic(event.weapon, settings, handling.braced, event.offhand);
    }
    else if (event.type === 'armorHit') {
      xr.haptic('armor', settings);
      setNotice(event.armor ? 'Armor took the hit' : 'Armor broke');
    }
    else if (event.type === 'death') inspectDeath();
  }
}

function updateHUD(force = false) {
  if (!force && run.time < hudAt) return;
  hudAt = run.time + .07;
  const p = run.player, display = Math.ceil(p.battery * 100);
  text('clock', formatTime(run.time));
  $('arsenal-crowd').hidden = !run.arsenal;
  if (run.arsenal) text('arsenal-crowd', 'MIN ' + run.arsenal.wave + ' · ' + run.enemies.length + '/' + activeHordeLimit(run) + ' ZOMBIES');
  text('weapon-name', p.offhand ? 'DUAL SERVICE PISTOLS' : GUNS[p.weapon].name.toUpperCase());
  const rounds = count => String(count).padStart(2, '0');
  $('rounds').firstChild.textContent = rounds(p.ammo) + (p.offhand ? ' + ' + rounds(p.offhand.ammo) : '') + ' ';
  $('rounds').lastChild.textContent = '/ ' + p.equippedReserve;
  const light = p.offhand ? legendaryBeamLabel(p, settings.leftHanded) + ' · ∞'
    : (p.flashlight ? p.beam.toUpperCase() : 'RECHARGING') + ' · ' + display + '%';
  text('light-text', light);
  $('charge').style.transform = 'scaleX(' + p.battery + ')';
  text('armor', '◆'.repeat(p.armor) + '◇'.repeat(3 - p.armor));
  $('armor').setAttribute('aria-label', p.armor + ' armor charges');
  text('notice', run.time < noticeUntil ? notice : '');
  $('offer').hidden = !run.offer;
  const radio = run.offer?.kind === 'radio';
  if (radio) text('offer', touch ? 'CALL EXTRACTION' : 'E TO CALL EXTRACTION');
  else if (run.offer) text('offer', (touch ? 'EQUIP' : 'E TO EQUIP') + ' · ' + LOOT[run.offer.kind].name);
  const reload = p.reload || p.offhand?.reload;
  $('reload-meter').hidden = !reload;
  $('touch-cycle').disabled = Object.keys(p.magazines).length < 2;
  if (touch) {
    text('touch-interact', radio ? 'Call' : 'Equip');
    text('touch-beam', p.offhand ? (settings.leftHanded ? 'L Beam' : 'R Beam') : 'Beam');
    text('touch-light', p.offhand ? (settings.leftHanded ? 'R Beam' : 'L Beam') : 'Light');
  }
  if (reload) $('reload-progress').style.transform = 'scaleX(' + (1 - reload.left / reload.duration) + ')';
}

function xrUI(sample, trackedView) {
  if (!xr.active || !sample || !trackedView.view) {
    xr.drawAimPreview(null);
    return;
  }
  if (phase === 'inspect' || phase === 'extracting') {
    xr.hidePanel();
    xr.drawAimPreview(null);
    xr.drawPrompt(phase === 'inspect' ? 'A · RESULTS' : RADIO_REPLY, trackedView.view);
    return;
  }
  if (phase === 'playing') {
    xr.hidePanel();
    const target = run.offer?.kind === 'radio' ? 'GRIP  ·  CALL EXTRACTION' : run.offer && 'GRIP  ·  ' + LOOT[run.offer.kind].name;
    const frameReport = showPerformance && perfSample
      ? perfSample.fps + ' FPS · P95 ' + perfSample.p95Ms + ' ms · ' + Math.round(perfSample.missed * 100)
        + '% missed · ' + perfSample.active + '/' + perfSample.limit
      : '';
    xr.drawPrompt(target || (run.time < noticeUntil ? notice : frameReport), trackedView.view);
    return;
  }
  xr.drawPrompt('', trackedView.view);
  const key = calibrating ? 'angle:' + settings.gunPitch + ':' + settings.gunYaw : phase + ':' + sample.tracked;
  if (panelKey !== key) {
    panelKey = key;
    const cards = {
      menu: {
        title: 'Enter the forest',
        lines: [
          MODES[settings.mode] + ' · ' + DIFFICULTIES[settings.difficulty].name,
          'B changes mode. X changes difficulty.',
          ...(settings.mode === 'arsenal'
            ? ['Minute ' + settings.arsenalWave + ' · ' + GUNS[settings.arsenalWeapon].name,
              'Y changes wave. Weapon grip cycles starting weapon.']
            : ['Follow roads and search sheds for the extraction radio.',
              settings.mode === 'legendary' ? 'Dual pistols and always-on lights. Unranked run.'
                : 'Search the woods. Keep your light and ammo ready.']),
        ],
        hint: sample.tracked ? 'WEAPON TRIGGER  ·  START' : 'CONNECT BOTH CONTROLLERS',
        second: 'A  ·  GUN ANGLE',
      },
      paused: { title: 'Paused', lines: [pauseReason],
        hint: sample.weaponTracked ? 'TRIGGER  ·  RESUME' : 'CONNECT WEAPON CONTROLLER', second: 'A  ·  GUN ANGLE' },
      angle: { title: 'Gun Angle', lines: [
        'Aim at this panel to see where the barrel points.',
        'Weapon stick adjusts pitch and yaw by 1°.',
        'Pitch ' + settings.gunPitch + '°    /    Yaw ' + settings.gunYaw + '°',
      ], hint: 'TRIGGER  ·  DONE', second: 'WEAPON GRIP  ·  RESET TO DEFAULT' },
      results: { title: run.status === 'escaped' ? 'Escaped' : 'The light went out.',
        lines: [run.status === 'escaped' ? RADIO_REPLY : deathMessage,
          formatTime(run.time) + (run.status === 'escaped' ? ' escape time' : ' survived') + '   /   ' + run.player.kills + ' kills',
          run.player.headshots + ' headshots   /   ' + resultNote], hint: 'TRIGGER  ·  NEW FOREST',
        second: run.status === 'escaped' ? 'GRIP  ·  SAME SEED' : 'GRIP  ·  SAME SEED      A  ·  LOOK AROUND' },
    };
    const page = calibrating ? 'angle' : phase;
    xr.drawPanel(page, trackedView.view, cards[page]);
  }
  xr.drawAimPreview(calibrating ? trackedView.aim : null);
}

function measure(wall, stereo) {
  if (phase !== 'playing' || !stereo || manualClock) return;
  perfElapsed += wall;
  perfFrames++;
  const hz = xr.active?.frameRate || 72, target = 1 / hz;
  if (wall > target * 1.5) missed += Math.max(1, Math.round(wall / target) - 1);
  maxFrame = Math.max(wall, maxFrame);
  perfTimes.push(wall);
  if (perfElapsed < 5) return;
  const fps = perfFrames / perfElapsed, loss = missed / (missed + perfFrames);
  perfTimes.sort((a,b)=>a-b);
  const p95Ms = Number((perfTimes[Math.ceil(perfTimes.length*.95)-1]*1000).toFixed(1));
  perfSample = { fps: Number(fps.toFixed(1)), missed: Number(loss.toFixed(3)), p95Ms,
    maxMs: Math.round(maxFrame * 1000), active: run.enemies.length, limit: activeHordeLimit(run) };
  if (loss > .075 || fps < hz * .91) {
    stableWindows = 0;
    if (quality > 1) presentation.setQuality(--quality);
    else run.crowdLimit = Math.max(11, Math.min(run.crowdLimit - 4, run.enemies.length + 2));
  } else if (loss < .023 && fps >= hz * .96) {
    if (++stableWindows > 4) {
      run.crowdLimit = Math.min(48, run.crowdLimit + 2);
      stableWindows = 0;
    }
  } else stableWindows = 0;
  perfElapsed = perfFrames = missed = maxFrame = 0;
  perfTimes.length = 0;
}

function simulate(t, sample, stereo) {
  accumulator = Math.min(.22, accumulator + t);
  while (accumulator + 1e-9 >= STEP && phase === 'playing') {
    accumulator -= STEP;
    const state = stereo ? { yaw: sample?.yaw, eyeHeight: sample?.eyeHeight,
      fireHeld: sample?.fireHeld, moveX: sample?.moveX, moveZ: sample?.moveZ, walk: sample?.walk } : desktopInput();
    handling.advance(STEP);
    if (run.legendary) offhandHandling.advance(STEP);
    const aimed = trackedView(stereo);
    const input = { ...state, ...queued,
      roomX, roomZ, aim: aimed.aim, lamp: aimed.beam,
      weaponUnavailable: stereo && !aimed.aim, lampUnavailable: stereo && !aimed.beam,
    };
    if (run.legendary) {
      input.offhandFire = stereo ? queued.offhandFire : queued.fire;
      input.offhandAim = aimed.offhandAim;
      input.offhandUnavailable = stereo && !aimed.offhandAim;
      input.offhandLamp = aimed.offhandBeam;
    }
    if (motionReplay && run.enemies[0] && !stereo) {
      const shots = run.metrics.shots;
      if (shots < 2 && run.time >= (shots === 0 ? 8.2 : 10)) {
        const at = enemyPose(run.enemies[0])[shots === 0 ? 'torso' : 'head'];
        const origin = { x:run.player.x, y:run.player.y+1.34, z:run.player.z };
        input.aim = { origin, ray:{x:at.x-origin.x,y:at.y-origin.y,z:at.z-origin.z} };
        input.fire = true;
      }
    }
    roomX = roomZ = 0;
    for (const key of Object.keys(queued)) delete queued[key];
    const weapon = run.player.weapon;
    const batch = stepRun(run, input);
    handleEvent(batch);
    if (weapon !== run.player.weapon)
      handling.reset(run.player.weapon, stereo && sample?.supportGrip !== false);
  }
}

function frame(now, xrFrame) {
  const elapsed = lastTime === undefined ? .016 : Math.min(.5, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const stereo = !!xrFrame && !!xr.active;
  if (phase === 'extracting' && performance.now() >= replyUntil) openResults();
  const previous = phase;
  const sample = stereo ? xr.sample(xrFrame, run.player, settings, phase) : null;
  if (stereo) {
    if (sample) {
      headTrackedAt = performance.now();
      if (phase === 'menu' || phase === 'paused') {
        if (calibrating) {
          if (sample.fire || sample.pause) { calibrating = false; panelKey = ''; }
          else if (sample.interact) updateGunSettings(0, 0);
          else if (sample.anglePitch || sample.angleYaw)
            updateGunSettings(settings.gunPitch + sample.anglePitch, settings.gunYaw + sample.angleYaw);
        } else if (phase === 'menu' && sample.menuDifficulty) cycleRunOption('difficulty');
        else if (phase === 'menu' && sample.menuMode) cycleRunOption('mode');
        else if (phase === 'menu' && settings.mode === 'arsenal' && sample.menuWave) cycleRunOption('arsenalWave');
        else if (phase === 'menu' && settings.mode === 'arsenal' && sample.interact) cycleRunOption('arsenalWeapon');
        else if (sample.reload) { calibrating = true; panelKey = ''; }
        else if (phase === 'menu' && sample.fire && sample.tracked) start();
        else if (phase === 'paused' && sample.fire && sample.weaponTracked) resume();
      } else if (phase === 'inspect') {
        if (sample.reload) openResults();
        else inspectFlashlights(run, sample);
      } else if (phase === 'results') {
        if (sample.reload && run.status === 'dead') lookAround();
        else if (performance.now() - deathAt > 950) {
          if (sample.fire) start();
          else if (sample.interact) rematch();
        }
      } else if (phase === 'playing') {
        if (sample.pause) pause();
        else if (!sample.weaponTracked && sample.missingFor > .5) pause('Weapon controller tracking was lost.');
        else {
          for (const key of ['reload', 'cycleWeapon', 'fire', 'offhandFire', 'toggleLight', 'toggleBeam',
            'cyclePrimaryBeam', 'cycleOffhandBeam', 'interact'])
            if (sample[key]) queued[key] = true;
          roomX += sample.roomX; roomZ += sample.roomZ;
        }
      }
    } else if (performance.now() - headTrackedAt > .45 * 1000) pause('Headset tracking was lost.');
  }
  const dt = Math.min(.09, elapsed);
  measure(elapsed, stereo);
  if (stereo && phase === 'playing' && !run.player.offhand) {
    const kind = run.player.weapon;
    const tracking = { weapon: heldPose(sample?.tools.weapon, true), lamp: heldPose(sample?.tools.lamp, true) };
    handling.updateBrace(kind, tracking, layouts[kind], settings, true, sample?.supportGrip ?? null, elapsed);
  }
  if (phase === 'playing' && !manualClock && (!stereo || xr.active.visibilityState === 'visible'))
    simulate(previous === phase && (!stereo || sample) ? dt : 0, sample, stereo);
  const view = trackedView(stereo, accumulator);
  const active = phase === 'playing', inspecting = phase === 'inspect' || phase === 'extracting', p = run.player;
  const laser = active && settings.laserDot;
  aimHit = laser && !p.reload && view.aim ? traceAim(run, view.aim) : null;
  offhandAimHit = laser && p.offhand && !p.offhand.reload && view.offhandAim ? traceAim(run, view.offhandAim) : null;
  const lightsActive = (active || inspecting) && p.flashlight;
  const beam = lightsActive ? resolvePlayerBeam(run, view.beam, view.view?.position) : null;
  const offhandBeam = lightsActive ? resolvePlayerBeam(run, view.offhandBeam, view.view?.position, true) : null;
  presentation.update(run, dt, settings, view.tracking, {
    active, inspecting, stereo, calibration: calibrating, menu: phase === 'menu' && !stereo, beam, offhandBeam,
    aim: active ? view.aim : null, aimHit, offhandAim: active ? view.offhandAim : null, offhandAimHit,
    viewpoint: view.view?.position,
    enemyAlpha: active && !manualClock ? clamp(accumulator / STEP, 0, 1) : 1,
  });
  if (view.view) {
    audio.listener(view.view.position, direction0.clone().applyQuaternion(view.view.quaternion),
      vertical.clone().applyQuaternion(view.view.quaternion), run);
  }
  if (phase === 'playing' && !stereo) {
    const point = view.aim.origin.clone().addScaledVector(view.aim.ray, 27).project(camera);
    $('crosshair').style.left = (point.x + 1) * 50 + '%';
    $('crosshair').style.top = (1 - point.y) * 50 + '%';
    updateHUD();
  }
  xrUI(sample, view);
  if (debugVisible && run.time >= debugAt && phase === 'playing' && !stereo) {
    debugAt = run.time + .15;
    drawDebug($('map'), $('debug-summary'), run);
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(frame);
setPhase('menu');

if (debugEnabled) {
  window.render_game_to_text = () => JSON.stringify({
    phase, seed: run.seed, difficulty:run.difficulty, arsenal:run.arsenal, crowdTarget:activeHordeLimit(run),
    elapsed: Number(run.time.toFixed(2)), player: run.player,
    enemies: run.enemies.map(({ id, kind, appearance, x, z, reason, route }) => ({ id, kind, appearance, x, z, reason, route })),
    loot: run.loot.filter(l => !l.lost).map(l => ({ ...l, power: isSupply(l.kind) ? 0 : flarePower(run.time - l.born) })),
    signalFlares: run.signalFlares.map(({ id, x, y, z, landed, born }) =>
      ({ id, x, y, z, landed, power: landed ? signalFlarePower(run.time - born) : null })),
    offer: run.offer?.kind, death: run.death, metrics: run.metrics, perf: perfSample,
    laser: aimHit ? { zone:aimHit.zone, point:aimHit.point } : null,
    offhandLaser: offhandAimHit ? { zone:offhandAimHit.zone, point:offhandAimHit.point } : null,
    flashlight: run.beam, offhandFlashlight: run.offhandBeam,
  });
  window.advanceTime = milliseconds => {
    manualClock = true;
    manualRemainder += Math.max(0, milliseconds) / 1000;
    const steps = Math.floor((manualRemainder + 1e-9) / STEP);
    manualRemainder -= steps * STEP;
    for (let i = 0; i < steps; i++) simulate(STEP, null, false);
    updateHUD(true);
  };
}
