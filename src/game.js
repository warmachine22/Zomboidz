import * as THREE from 'three';
import { addEnemy, BUILD, createRun, flarePower, GUNS, LOOT, setLoot, STEP, stepRun, traceAim } from './simulation.js';
import { createPresentation, loadArt } from './presentation.js';
import { clamp } from './world.js';
import { createAudio } from './audio.js';
import { createXR } from './xr.js';
import { formatTime, initials, listScores, loadSettings, rapidSeed, recordRun, saveSettings } from './records.js';
import { drawDebug } from './debug-map.js';
import { heldPose, mountedAim, toolLayouts } from './held-tools.js';

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

const art = await loadArt();
const layouts = toolLayouts(art);
const presentation = createPresentation(scene, art, layouts);
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
let joystick = { x: 0, y: 0 }, desktopFire = false, touchFire = false, dragDistance = 0;
let lastTime, accumulator = 0, manualClock = false, manualRemainder = 0, hudAt = -1, debugAt = -1;
let notice = '', noticeUntil = 0, headTrackedAt = 0, deathAt = 0, panelKey = '', useMouseDrag = false;
let quality = 3, perfElapsed = 0, perfFrames = 0, stableWindows = 0, missed = 0, maxFrame = 0, perfSample = null;
let debugVisible = false;
let aimHit = null;
const direction0 = new THREE.Vector3(0, 0, -1);
const vertical = new THREE.Vector3(0, 1, 0);
const text = (id, value) => { $(id).textContent = value; };

function clearInput() {
  held.clear();
  for (const action of Object.keys(queued)) delete queued[action];
  desktopFire = touchFire = false;
  joystick = { x: 0, y: 0 };
  roomX = roomZ = accumulator = 0;
  $('stick').firstElementChild.style.transform = '';
}

function setPhase(next) {
  phase = next;
  panelKey = '';
  const running = phase === 'playing', isXR = !!xr.active;
  document.body.classList.toggle('running', running);
  $('shell').hidden = phase !== 'menu';
  $('hud').hidden = !running || isXR;
  $('touch').hidden = !running || !touch || isXR;
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
      setNotice('Click and drag to look', 5);
    });
    if (!canvas.requestPointerLock) useMouseDrag = true;
  } catch { useMouseDrag = true; }
}

function start(seed = rapidSeed()) {
  useMouseDrag = false;
  const encounter = debugEnabled && qs.get('scenario') === 'roadside';
  run = createRun(encounter ? 'Blackwater' : seed, { crowdLimit: xr.active ? 48 : touch ? 34 : 48, populate: !encounter });
  if (encounter) {
    addEnemy(run, 'shambler', -.55, 13.6);
    addEnemy(run, 'shrieker', 1.7, 10.2);
    addEnemy(run, 'brute', -.6, 8.4);
    setLoot(run, 'armor2', 1.5, 14.9);
    setLoot(run, 'shotgun', -1.7, 11.1);
  }
  runId = rapidSeed();
  yaw = pitch = roomX = roomZ = 0;
  notice = '';
  hudAt = debugAt = -1;
  quality = 3;
  perfElapsed = perfFrames = stableWindows = missed = maxFrame = 0;
  presentation.setQuality(quality);
  audio.reset();
  void audio.unlock();
  setPhase('playing');
  if (!xr.active) pointerLock();
  setNotice('Follow the road for supplies', 5);
  updateHUD(true);
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

function resultScore() {
  if (run.status !== 'dead') return;
  const outcome = recordRun(run, runId, settings.initials);
  resultNote = outcome.saved ? outcome.place ? 'Local rank ' + outcome.place + ' · Seed ' + run.seed : 'Seed ' + run.seed
    : 'Browser storage is unavailable. Seed ' + run.seed;
  text('result-storage', resultNote);
}

function results() {
  if (phase !== 'playing') return;
  deathAt = performance.now();
  const { kind, yaw: angle } = run.death;
  const bearing = Math.abs(angle) < .60 ? 'ahead' : Math.abs(angle) > 2.35 ? 'behind you' : angle < 0 ? 'on your left' : 'on your right';
  deathMessage = 'A ' + kind + ' landed a hit ' + (bearing === 'ahead' ? 'from ahead' : bearing) + '.';
  text('death-reason', deathMessage);
  text('result-time', formatTime(run.time));
  text('result-kills', run.player.kills);
  text('result-heads', run.player.headshots);
  $('result-initials').value = settings.initials;
  resultScore();
  setPhase('results');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function showPanel(id) {
  for (const panel of ['home', 'controls', 'scores', 'settings']) $(panel).hidden = panel !== id;
  if (id !== 'scores') return;
  const target = $('score-table'), items = listScores();
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
$('restart').addEventListener('click', () => start());
$('rematch').addEventListener('click', () => start(run.seed));
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

const keyboard = { KeyR: 'reload', KeyF: 'toggleLight', KeyQ: 'toggleBeam', KeyE: 'interact', Space: 'fire' };
document.addEventListener('keydown', event => {
  if (event.target.matches?.('input, textarea')) return;
  if (phase === 'playing') {
    held.add(event.code);
    if (keyboard[event.code] && !event.repeat) queued[keyboard[event.code]] = true;
    if (event.code === 'Escape') pause();
    if (event.code === 'Space') event.preventDefault();
    if (debugEnabled && event.code === 'KeyM' && !event.repeat) {
      debugVisible = !debugVisible;
      $('debug').hidden = !debugVisible;
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
  if (phase !== 'playing' || xr.active || touch || e.button !== 0) return;
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
  if (useMouseDrag && desktopFire && dragDistance < 7) queued.fire = true;
  desktopFire = false;
});
document.addEventListener('mousemove', e => {
  if (phase === 'playing' && (document.pointerLockElement === canvas || (useMouseDrag && desktopFire))) {
    dragDistance += Math.hypot(e.movementX, e.movementY);
    look(e.movementX, e.movementY);
  }
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
    if (action === 'pause') pause(); else queued[action] = true;
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
  camera.updateWorldMatrix(true, false);
  const view = { position: camera.getWorldPosition(new THREE.Vector3()), quaternion: camera.getWorldQuaternion(new THREE.Quaternion()) };
  const sign = settings.leftHanded ? -1 : 1;
  const hold = (x, y, z, a, b) => ({
    position: camera.localToWorld(new THREE.Vector3(x, y, z)),
    quaternion: view.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(a,b,0))),
  });
  const span = touch ? .19 : .236;
  const long = p.weapon === 'shotgun' ? -.63 : -.48;
  return { view, tracking: {
    weapon: hold(sign * span, -.323, long, .037, sign * .085),
    lamp: hold(-sign * (span + .009), -.264, -.435, -.037, -sign * .072),
  } };
}

function trackedView(stereo) {
  const view = stereo ? xr.sync(run.player, settings) : desktopView();
  view.tracking.weapon = heldPose(view.tracking.weapon, true, stereo);
  view.tracking.lamp = heldPose(view.tracking.lamp, false, stereo);
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
    else if (event.type === 'light' && event.empty) setNotice('Battery depleted. Recharging.');
    else if (event.type === 'shot') xr.haptic(event.weapon, settings);
    else if (event.type === 'armorHit') {
      xr.haptic('armor', settings);
      setNotice(event.armor ? 'Armor took the hit' : 'Armor broke');
    }
    else if (event.type === 'death') results();
  }
}

function updateHUD(force = false) {
  if (!force && run.time < hudAt) return;
  hudAt = run.time + .07;
  const p = run.player, display = Math.ceil(p.battery * 100);
  text('clock', formatTime(run.time));
  text('weapon-name', GUNS[p.weapon].name.toUpperCase());
  $('rounds').firstChild.textContent = String(p.ammo).padStart(2, '0') + ' ';
  $('rounds').lastChild.textContent = '/ ' + p.reserve;
  text('light-text', (p.flashlight ? p.beam.toUpperCase() : 'RECHARGING') + ' · ' + display + '%');
  $('charge').style.transform = 'scaleX(' + p.battery + ')';
  text('armor', '◆'.repeat(p.armor) + '◇'.repeat(3 - p.armor));
  $('armor').setAttribute('aria-label', p.armor + ' armor charges');
  text('notice', run.time < noticeUntil ? notice : '');
  $('offer').hidden = !run.offer;
  if (run.offer) text('offer', (touch ? 'EQUIP' : 'E TO EQUIP') + ' · ' + LOOT[run.offer.kind].name);
  $('reload-meter').hidden = !p.reload;
  if (p.reload) $('reload-progress').style.transform = 'scaleX(' + (1 - p.reload.left / p.reload.duration) + ')';
}

function xrUI(sample, trackedView) {
  if (!xr.active || !sample || !trackedView.view) return;
  if (phase === 'playing') {
    xr.hidePanel();
    const target = run.offer && 'GRIP  ·  ' + LOOT[run.offer.kind].name;
    const frameReport = showPerformance && perfSample
      ? perfSample.fps + ' FPS · ' + Math.round(perfSample.missed * 100) + '% missed · ' + perfSample.active + ' active'
      : '';
    xr.drawPrompt(target || (run.time < noticeUntil ? notice : frameReport), trackedView.view);
    return;
  }
  xr.drawPrompt('', trackedView.view);
  const key = phase + ':' + sample.tracked;
  if (panelKey !== key) {
    panelKey = key;
    const cards = {
      menu: {
        title: 'Enter the forest',
        lines: ['Weapon trigger fires. Primary button reloads.', 'Other trigger toggles light. Grip equips loot.',
          'Left stick moves. Right stick snap turns.', 'Look at your wrist for ammo and armor.'],
        hint: sample.tracked ? 'WEAPON TRIGGER  ·  START' : 'CONNECT BOTH CONTROLLERS',
      },
      paused: { title: 'Paused', lines: [pauseReason], hint: sample.tracked ? 'TRIGGER  ·  RESUME' : 'CONNECT BOTH CONTROLLERS' },
      results: { title: 'The light went out.', lines: [deathMessage, formatTime(run.time) + ' survived   /   ' + run.player.kills + ' kills',
        run.player.headshots + ' headshots   /   ' + resultNote], hint: 'TRIGGER  ·  NEW FOREST', second: 'WEAPON GRIP  ·  SAME SEED' },
    };
    xr.drawPanel(phase, trackedView.view, cards[phase]);
  }
}

function measure(wall, stereo) {
  if (phase !== 'playing' || !stereo || manualClock) return;
  perfElapsed += wall;
  perfFrames++;
  const hz = xr.active?.frameRate || 72, target = 1 / hz;
  if (wall > target * 1.5) missed += Math.max(1, Math.round(wall / target) - 1);
  maxFrame = Math.max(wall, maxFrame);
  if (perfElapsed < 5) return;
  const fps = perfFrames / perfElapsed, loss = missed / (missed + perfFrames);
  perfSample = { fps: Number(fps.toFixed(1)), missed: Number(loss.toFixed(3)), maxMs: Math.round(maxFrame * 1000), active: run.enemies.length, limit: run.crowdLimit };
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
}

function simulate(t, sample, stereo) {
  let view = trackedView(stereo);
  accumulator = Math.min(.22, accumulator + t);
  while (accumulator + 1e-9 >= STEP && phase === 'playing') {
    accumulator -= STEP;
    const state = stereo ? { yaw: sample?.yaw, eyeHeight: sample?.eyeHeight,
      fireHeld: sample?.fireHeld, moveX: sample?.moveX, moveZ: sample?.moveZ, walk: sample?.walk } : desktopInput();
    const input = { ...state, ...queued,
      roomX, roomZ, aim: mountedAim(view.tracking.weapon, layouts[run.player.weapon], view.view, !stereo),
      lamp: mountedAim(view.tracking.lamp, layouts.flashlight, view.view, false),
    };
    roomX = roomZ = 0;
    for (const key of Object.keys(queued)) delete queued[key];
    const batch = stepRun(run, input);
    handleEvent(batch);
    view = trackedView(stereo);
  }
  return view;
}

function frame(now, xrFrame) {
  const elapsed = lastTime === undefined ? .016 : Math.min(.5, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const stereo = !!xrFrame && !!xr.active;
  const previous = phase;
  const sample = stereo ? xr.sample(xrFrame, run.player, settings, phase) : null;
  if (stereo) {
    if (sample) {
      headTrackedAt = performance.now();
      if (phase === 'menu' && sample.fire && sample.tracked) start();
      else if (phase === 'paused' && sample.fire && sample.tracked) resume();
      else if (phase === 'results' && performance.now() - deathAt > 950) {
        if (sample.fire) start();
        else if (sample.interact) start(run.seed);
      } else if (phase === 'playing') {
        if (sample.pause) pause();
        else if (!sample.tracked && sample.missingFor > .5) pause('Controller tracking was lost.');
        else {
          for (const key of ['reload', 'fire', 'toggleLight', 'toggleBeam', 'interact'])
            if (sample[key]) queued[key] = true;
          roomX += sample.roomX; roomZ += sample.roomZ;
        }
      }
    } else if (performance.now() - headTrackedAt > .45 * 1000) pause('Headset tracking was lost.');
  }
  const dt = Math.min(.09, elapsed);
  measure(elapsed, stereo);
  const view = phase === 'playing' && !manualClock && (!stereo || (sample?.tracked && xr.active.visibilityState === 'visible'))
    ? simulate(previous === phase ? dt : 0, sample, stereo)
    : trackedView(stereo);
  const active = phase === 'playing';
  aimHit = active && !run.player.reload && settings.laserDot && (!stereo || sample?.tracked)
    ? traceAim(run, mountedAim(view.tracking.weapon, layouts[run.player.weapon], view.view, !stereo)) : null;
  presentation.update(run, dt, settings, view.tracking, {
    active, stereo, menu: phase === 'menu' && !stereo, aimHit, viewpoint: view.view?.position,
  });
  if (view.view) {
    audio.listener(view.view.position, direction0.clone().applyQuaternion(view.view.quaternion),
      vertical.clone().applyQuaternion(view.view.quaternion), run);
  }
  if (phase === 'playing' && !stereo) updateHUD();
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
    phase, seed: run.seed, elapsed: Number(run.time.toFixed(2)), player: run.player,
    enemies: run.enemies.map(({ id, kind, x, z, reason, route }) => ({ id, kind, x, z, reason, route })),
    loot: run.loot.filter(l => !l.lost).map(l => ({ ...l, power: l.kind === 'ammo' ? 0 : flarePower(run.time - l.born) })),
    offer: run.offer?.kind, death: run.death, metrics: run.metrics, perf: perfSample,
    laser: aimHit ? { zone:aimHit.zone, point:aimHit.point } : null,
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
