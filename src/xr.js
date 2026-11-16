import * as THREE from 'three';
import { clamp } from './world.js';

const forward = new THREE.Vector3(0, 0, -1);
const up = new THREE.Vector3(0, 1, 0);

function vec(p) { return new THREE.Vector3(p.x, p.y, p.z); }
function quat(q) { return new THREE.Quaternion(q.x, q.y, q.z, q.w); }
function poseOf(pose) { return { position: vec(pose.transform.position), quaternion: quat(pose.transform.orientation) }; }
const button = (gamepad, index) => Boolean(gamepad?.buttons?.[index]?.pressed);
const axis = (gamepad, index) => gamepad?.axes?.[gamepad.axes.length >= 4 ? index + 2 : index] || 0;

export function createXR(renderer, scene, rig) {
  let active = null, offsetYaw = 0, rawView = null, priorView = null, seatedHeight = null;
  let domMode = '', turnHeld = false, recoveredAt = 0;
  let edges = {}, sources = {}, baseHeight = 1.63, current = null;
  let changeListener;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 597;
  const ctx = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.77, 1.032),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, toneMapped: false, depthWrite: false }));
  panel.renderOrder = 1000;
  panel.visible = false;
  scene.add(panel);
  const promptCanvas = document.createElement('canvas'); promptCanvas.width = 640; promptCanvas.height = 96;
  const promptContext = promptCanvas.getContext('2d');
  const promptTexture = new THREE.CanvasTexture(promptCanvas); promptTexture.colorSpace = THREE.SRGBColorSpace;
  const prompt = new THREE.Mesh(new THREE.PlaneGeometry(.82, .123),
    new THREE.MeshBasicMaterial({ map: promptTexture, transparent: true, toneMapped: false, depthWrite: false }));
  scene.add(prompt);
  prompt.visible = false;
  let promptText = '';

  async function supported() {
    return !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  }

  async function enter(onVisibility) {
    const session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'],
    });
    active = session;
    changeListener = () => onVisibility(session.visibilityState);
    session.addEventListener('visibilitychange', changeListener);
    try {
      await renderer.xr.setSession(session);
    } catch (error) {
      if (active === session) {
        session.removeEventListener('visibilitychange', changeListener);
        active = null;
      }
      await session.end().catch(() => {});
      throw error;
    }
    if (session.supportedFrameRates && Array.from(session.supportedFrameRates).includes(72))
      session.updateTargetFrameRate?.(72).catch(() => {});
  }

  function reset() {
    offsetYaw = 0;
    current = rawView = priorView = null;
    seatedHeight = null;
    domMode = '';
    edges = {}; sources = {};
    panel.visible = prompt.visible = false;
    recoveredAt = performance.now();
  }

  function finish() {
    active?.removeEventListener('visibilitychange', changeListener);
    active = null;
    reset();
  }

  function controller(frame, reference, source) {
    if (!source) return null;
    const grip = source.gripSpace && frame.getPose(source.gripSpace, reference);
    if (!grip) return null;
    return { grip: poseOf(grip), gamepad: source.gamepad };
  }

  function sample(frame, p, settings, phase) {
    if (!frame || !active) return null;
    const reference = renderer.xr.getReferenceSpace();
    const view = reference && frame.getViewerPose(reference);
    if (!view) { current = null; sources = {}; return null; }
    rawView = poseOf(view);
    if (seatedHeight === null) seatedHeight = rawView.position.y;
    baseHeight = clamp(rawView.position.y + (settings.seated ? 1.57 - seatedHeight : 0), .62, 2.25);
    sources = {};
    for (const s of active.inputSources) {
      if (s.handedness === 'right' || s.handedness === 'left')
        sources[s.handedness] = controller(frame, reference, s);
    }
    const right = sources.right?.gamepad, left = sources.left?.gamepad;
    const handed = settings.leftHanded ? left : right, other = settings.leftHanded ? right : left;
    const gp = {
      fire: button(handed, 0), interact: button(handed, 1),
      reload: button(handed, 4), pause: button(handed, 5),
      toggleLight: button(other, 0), toggleBeam: button(other, 4),
    };
    const pressed = {};
    for (const key of Object.keys(gp)) pressed[key] = gp[key] && !edges[key];
    edges = gp;
    const rx = axis(right, 0);
    if (phase === 'playing' && Math.abs(rx) > .68 && !turnHeld) offsetYaw += Math.sign(rx) * Math.PI / 6;
    turnHeld = Math.abs(rx) > .42;
    const turn = new THREE.Quaternion().setFromAxisAngle(up, -offsetYaw);
    const delta = phase === 'playing' && priorView ? rawView.position.clone().sub(priorView).applyQuaternion(turn) : new THREE.Vector3();
    priorView = rawView.position.clone();
    const yaw = Math.atan2(heading().x, -heading().z);
    const lx = axis(left, 0), ly = axis(left, 1);
    const validMovement = Math.hypot(lx, ly) > .16;
    const moveX = validMovement ? Math.cos(yaw) * lx - Math.sin(yaw) * ly : 0;
    const moveZ = validMovement ? Math.sin(yaw) * lx + Math.cos(yaw) * ly : 0;
    const walk = Math.hypot(lx, ly) < .55;
    const tracked = !!sources.left && !!sources.right;
    if (tracked) recoveredAt = performance.now();
    current = { ...pressed, fireHeld: gp.fire, yaw, eyeHeight: baseHeight, roomX: delta.x, roomZ: delta.z,
      moveX, moveZ, walk, tracked, missingFor: (performance.now() - recoveredAt) / 1000 };
    return current;
  }

  function heading() {
    const turn = new THREE.Quaternion().setFromAxisAngle(up, -offsetYaw);
    return rawView ? forward.clone().applyQuaternion(rawView.quaternion).applyQuaternion(turn) : forward.clone();
  }

  function sync(p, settings) {
    if (!rawView) return { tracking: {}, view: null };
    rig.rotation.set(0, -offsetYaw, 0);
    const rotated = rawView.position.clone().applyQuaternion(rig.quaternion);
    rig.position.set(p.x - rotated.x, p.y + baseHeight - rotated.y, p.z - rotated.z);
    rig.updateMatrixWorld(true);
    const asWorld = local => local && ({
      position: rig.localToWorld(local.position.clone()),
      quaternion: rig.quaternion.clone().multiply(local.quaternion),
    });
    const tracked = (settings.leftHanded ? sources.left : sources.right);
    const lamp = (settings.leftHanded ? sources.right : sources.left);
    return { tracking: { weapon: asWorld(tracked?.grip), lamp: asWorld(lamp?.grip) }, view: asWorld(rawView) };
  }

  function drawPanel(page, view, { title, lines = [], hint, second }) {
    if (!view) return;
    if (!panel.visible || page !== domMode) {
      const facing = heading(); facing.y = 0; facing.normalize();
      panel.position.copy(view.position).addScaledVector(facing, 1.89);
      panel.position.y -= .01;
      panel.rotation.y = Math.atan2(-facing.x, -facing.z);
      domMode = page;
    }
    panel.visible = true;
    ctx.clearRect(0, 0, 1024, 597);
    ctx.fillStyle = '#141f1eef'; ctx.fillRect(0, 0, 1024, 597);
    ctx.strokeStyle = '#a0aa8d'; ctx.lineWidth = 4; ctx.strokeRect(22, 22, 980, 553);
    ctx.fillStyle = '#bdc8a8'; ctx.font = '27px monospace'; ctx.fillText('ZOMBOIDZ   /   THE LAST LIGHT', 70, 89);
    ctx.fillStyle = '#ede8d6'; ctx.font = 'bold 78px sans-serif'; ctx.fillText(title, 64, 198, 885);
    ctx.font = '34px sans-serif';
    lines.slice(0,4).forEach((line, i) => ctx.fillText(line, 70, 278+i*46, 878));
    ctx.fillStyle = '#bdcca0'; ctx.font = 'bold 30px monospace'; ctx.fillText(hint, 70, 494, 878);
    if (second) { ctx.font = '23px monospace'; ctx.fillText(second, 70, 530, 878); }
    map.needsUpdate = true;
  }

  function drawPrompt(text, view) {
    if (!text || !view) { prompt.visible = false; return; }
    if (text !== promptText) {
      promptText = text;
      promptContext.clearRect(0, 0, 640, 96);
      promptContext.fillStyle = '#18231be7'; promptContext.fillRect(0,0,640,96);
      promptContext.font = 'bold 25px monospace'; promptContext.fillStyle = '#e7e8cf';
      promptContext.textAlign = 'center'; promptContext.fillText(text, 320, 59, 602);
      promptTexture.needsUpdate = true;
    }
    const face = heading().setY(0).normalize();
    prompt.position.copy(view.position).addScaledVector(face, 1.2);
    prompt.position.y -= .48;
    prompt.rotation.y = Math.atan2(-face.x, -face.z);
    prompt.visible = true;
  }

  function haptic(kind, settings) {
    const s = sources[settings.leftHanded ? 'left' : 'right'];
    const strength = kind === 'shotgun' ? .79 : kind === 'smg' ? .37 : kind === 'armor' ? .89 : .51;
    s?.gamepad?.hapticActuators?.[0]?.pulse?.(strength, kind === 'armor' ? 125 : 32)?.catch?.(() => {});
  }

  return { supported, enter, reset, finish, sample, sync, drawPanel, drawPrompt, haptic,
    hidePanel() { panel.visible = false; },
    get active() { return active; },
  };
}
