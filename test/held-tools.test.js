import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createGunHandling, heldPose, mountedAim } from '../src/held-tools.js';
import { createRun, stepRun, traceAim } from '../src/simulation.js';

const layout = { muzzle: new Vector3(0, .10, -.42), support: new Vector3(.04, -.01, -.27) };
const lamp = { muzzle: new Vector3(0, .03, -.16) };
const settings = { gunPitch: 0, gunYaw: 0, leftHanded: false };
const pose = (position = new Vector3()) => ({ position, quaternion: new Quaternion() });
const forward = new Vector3(0, 0, -1);
const view = pose(new Vector3(0, 1.6, 20));
const weapon = pose(new Vector3(.17, 1.3, 19.6));

test('tracked pointing controls aim while the grip controls placement and calibration is optional', () => {
  const pointer = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .45);
  const grip = { ...weapon, pointer };
  const held = heldPose(grip, true);
  assert.ok(held.position.distanceTo(weapon.position) < .02);
  assert.ok(held.quaternion.angleTo(pointer) < 1e-7);
  const handling = createGunHandling();
  handling.reset('carbine');
  const neutral = handling.resolve({ weapon: held }, layout, view, settings, true);
  const adjusted = handling.resolve({ weapon: held }, layout, view, { ...settings, gunPitch: 5 }, true);
  const a = mountedAim(neutral.weapon, layout, view);
  const b = mountedAim(adjusted.weapon, layout, view);
  assert.ok(a.ray.distanceTo(forward.clone().applyQuaternion(pointer)) < 1e-8);
  assert.ok(Math.abs(a.ray.angleTo(b.ray) - 5 * Math.PI / 180) < 1e-8);
  assert.ok(b.origin.distanceTo(layout.muzzle.clone().applyQuaternion(adjusted.weapon.quaternion)
    .add(adjusted.weapon.position)) < 1e-8);
});

test('recoil changes the aim ray and recovers consistently across frame rates', () => {
  const recoverAt = fps => {
    const handling = createGunHandling();
    handling.reset('carbine');
    handling.kick(false);
    const barrel = () => mountedAim(handling.resolve({ weapon }, layout, view, settings, true).weapon, layout, view);
    assert.ok(barrel().ray.y > .10);
    for (let i = 0; i < fps / 4; i++) handling.advance(1 / fps);
    return barrel();
  };
  const slow = recoverAt(60), fast = recoverAt(120);
  assert.ok(slow.ray.distanceTo(fast.ray) < 1e-8);
  assert.ok(slow.origin.distanceTo(fast.origin) < 1e-8);
  assert.ok(slow.ray.y > 0 && slow.ray.y < .02);
});

test('bracing mirrors the support socket, reduces recoil, and reverts when released or tracking is lost', () => {
  for (const leftHanded of [false, true]) {
    const options = { ...settings, leftHanded };
    const offset = layout.support.clone();
    offset.x *= leftHanded ? 1 : -1;
    const support = pose(weapon.position.clone().add(offset));
    const handling = createGunHandling();
    handling.reset('carbine');
    const update = (held, tracked = support, kind = 'carbine', dt = .5) =>
      handling.updateBrace(kind, { weapon, lamp: tracked }, layout, options, true, held, dt);
    const resolve = () => handling.resolve({ weapon, lamp: support }, layout, view, options, true);
    update(true, pose(weapon.position.clone().add(new Vector3(1, 0, 0))));
    assert.equal(handling.braced, false);
    update(true);
    assert.equal(handling.braced, true);
    handling.kick(leftHanded);
    const braced = resolve();
    const bracedAim = mountedAim(braced.weapon, layout, view);
    assert.ok(bracedAim.ray.y > .025 && bracedAim.ray.y < .05);
    assert.ok(bracedAim.ray.angleTo(mountedAim(braced.lamp, lamp, view).ray) < .001);
    update(false, support, 'carbine', 1 / 90);
    assert.equal(handling.braced, false);
    assert.ok(resolve().support, 'dock blends out on release');
    update(false);
    assert.equal(resolve().support, undefined);
    update(true);
    update(true, null);
    update(true);
    assert.equal(handling.braced, false, 'squeeze again after losing tracking');
    update(false);
    update(true);
    update(true, support, 'shotgun');
    assert.equal(handling.braced, false, 'swapping clears the brace');
  }
});

test('the desktop bore, predicted impact, and fired impact use the same ray', () => {
  const handling = createGunHandling();
  handling.reset('carbine');
  const tracking = handling.resolve({ weapon }, layout, view, settings, false);
  const aim = mountedAim(tracking.weapon, layout, view);
  const range = 27 - aim.origin.clone().sub(view.position).dot(forward);
  assert.ok(aim.origin.clone().addScaledVector(aim.ray, range).distanceTo(view.position.clone().addScaledVector(forward, 27)) < .01);
  handling.kick(false);
  const kicked = mountedAim(handling.resolve({ weapon }, layout, view, settings, false).weapon, layout, view);
  const run = createRun('alignment', { populate: false });
  Object.assign(run.player, { y: 0, weapon: 'carbine', ammo: 16 });
  Object.assign(run.world, { height: () => 0, raycast: (origin, ray, max) => max > 4 ? { t: 5, kind: 'stone' } : null });
  const predicted = traceAim(run, kicked);
  const events = stepRun(run, { aim: kicked, fire: true });
  const shot = events.find(event => event.type === 'shot');
  const impact = events.find(event => event.type === 'impact');
  assert.ok(new Vector3(shot.ray.x, shot.ray.y, shot.ray.z).distanceTo(kicked.ray) < 1e-8);
  assert.deepEqual([impact.x, impact.y, impact.z], [predicted.point.x, predicted.point.y, predicted.point.z]);
});
