import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createGunHandling, heldPose, mountedAim, shotgunPumpTravel } from '../src/held-tools.js';
import { createRun, stepRun, traceAim } from '../src/simulation.js';
import { questButtons } from '../src/xr.js';

const layout = { muzzle: new Vector3(0, .10, -.42), support: new Vector3(.04, -.01, -.27) };
const lamp = { muzzle: new Vector3(0, .03, -.16) };
const settings = { gunPitch: 0, gunYaw: 0, leftHanded: false };
const pose = (position = new Vector3()) => ({ position, quaternion: new Quaternion() });
const forward = new Vector3(0, 0, -1);
const view = pose(new Vector3(0, 1.6, 20));
const weapon = pose(new Vector3(.17, 1.3, 19.6));

test('Quest face buttons stay on the physical controller in either handedness mode', () => {
  const pad = (...pressed) => ({ buttons: Array.from({ length: 6 }, (_, index) => ({ pressed: pressed.includes(index) })) });
  for (const leftHanded of [false, true]) {
    const a = questButtons(pad(4), pad(), leftHanded);
    assert.ok(a.reload && !a.toggleBeam && !a.pause && !a.cycleWeapon);
    const b = questButtons(pad(5), pad(), leftHanded);
    assert.ok(b.cycleWeapon && !b.pause && !b.reload);
    const left = questButtons(pad(), pad(4, 5), leftHanded);
    assert.ok(left.pause && left.toggleBeam && !left.reload && !left.cycleWeapon);
    const triggers = questButtons(pad(0, 1), pad(), leftHanded);
    assert.equal(triggers.fire, !leftHanded);
    assert.equal(triggers.interact, !leftHanded);
    assert.equal(triggers.toggleLight, leftHanded);
    const legendary = questButtons(pad(0), pad(0), leftHanded, true);
    assert.ok(legendary.fire && legendary.offhandFire && !legendary.toggleLight);
    const rightBeam = questButtons(pad(5), pad(), leftHanded, true);
    assert.equal(rightBeam.cyclePrimaryBeam, !leftHanded);
    assert.equal(rightBeam.cycleOffhandBeam, leftHanded);
    assert.ok(!rightBeam.cycleWeapon && !rightBeam.pause);
    const leftBeam = questButtons(pad(), pad(5), leftHanded, true);
    assert.equal(leftBeam.cyclePrimaryBeam, leftHanded);
    assert.equal(leftBeam.cycleOffhandBeam, !leftHanded);
    assert.ok(!leftBeam.pause);
    const pause = questButtons(pad(), pad(4), leftHanded, true);
    assert.ok(pause.pause && !pause.toggleBeam && !pause.cyclePrimaryBeam && !pause.cycleOffhandBeam);
  }
});

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

test('a matching pointing pose aligns both tools independently of each grip orientation', () => {
  const pointer = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -.11);
  const pistol = heldPose({ ...weapon, pointer }, true);
  const otherHand = pose(new Vector3(-.19, 1.26, 19.5));
  otherHand.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), .31);
  const flashlight = heldPose({ ...otherHand, pointer }, true);
  const gunRay = mountedAim(pistol, layout, view);
  const lightRay = mountedAim(flashlight, lamp, view);
  assert.ok(gunRay.ray.distanceTo(lightRay.ray) < 1e-8);
  assert.ok(gunRay.origin.distanceTo(lightRay.origin) > .25);
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

test('both hands steer each long gun through wide sweeps and keep the hand and dock on the recoiling foregrip', () => {
  for (const kind of ['shotgun', 'carbine', 'smg']) {
    for (const leftHanded of [false, true]) {
      const options = { ...settings, leftHanded };
      const handling = createGunHandling();
      const socket = layout.support.clone();
      socket.x *= leftHanded ? 1 : -1;
      const rest = pose(weapon.position.clone().add(socket));
      const braceAt = lamp => handling.updateBrace(kind, { weapon, lamp }, layout, options, true, true, .3);
      braceAt(rest);
      assert.ok(handling.braced);
      for (const direction of [new Vector3(.35, 0, -.32), new Vector3(-.38, .23, -.33)]) {
        const lamp = pose(weapon.position.clone().add(direction));
        braceAt(lamp);
        const solved = handling.resolve({ weapon, lamp }, layout, view, options, true);
        assert.ok(handling.braced);
        assert.ok(socket.clone().applyQuaternion(solved.weapon.quaternion).angleTo(direction) < .001);
        assert.ok(mountedAim(solved.weapon, layout, view).ray.angleTo(forward) > .65);
      }

      handling.kick(leftHanded);
      const pump = kind === 'shotgun' ? shotgunPumpTravel(.36) : 0;
      const solved = handling.resolve({ weapon, lamp: rest }, layout, view, options, true, false, 0, undefined, pump);
      const contact = socket.clone().add(new Vector3(0, 0, pump))
        .applyQuaternion(solved.weapon.quaternion).add(solved.weapon.position);
      assert.ok(solved.support.position.distanceTo(contact) < 1e-8);
      assert.ok(mountedAim(solved.lamp, lamp, view).ray.angleTo(mountedAim(solved.weapon, layout, view).ray) < 1e-7);
    }
  }
});

test('support aim tolerates brief tracking loss, tiny controller separation, and instant snap turns', () => {
  const handling = createGunHandling();
  const socket = layout.support.clone(); socket.x *= -1;
  const rest = pose(weapon.position.clone().add(socket));
  const extended = pose(weapon.position.clone().add(new Vector3(.28, .16, -.31)));
  const update = (lamp, pressed = true, dt = .18) =>
    handling.updateBrace('shotgun', { weapon, lamp }, layout, settings, true, pressed, dt);
  const resolve = lamp => handling.resolve({ weapon, lamp }, layout, view, settings, true);
  update(rest);
  update(extended);
  const before = resolve(extended);
  update(pose(weapon.position.clone().add(new Vector3(0, .03, 0))));
  assert.ok(resolve(rest).weapon.quaternion.angleTo(before.weapon.quaternion) < 1e-7);
  update(undefined, null, .08);
  assert.ok(handling.braced);
  assert.ok(resolve().support.position.distanceTo(before.support.position) < 1e-8);
  update(extended);
  assert.ok(handling.braced);

  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 6);
  const rotatePose = p => ({ position: p.position.clone().applyQuaternion(turn), quaternion: turn.clone().multiply(p.quaternion) });
  const original = resolve(extended);
  const turned = handling.resolve({ weapon: rotatePose(weapon), lamp: rotatePose(extended) },
    layout, view, settings, true, false, 0, turn);
  assert.ok(turned.weapon.quaternion.angleTo(turn.clone().multiply(original.weapon.quaternion)) < 1e-7);
  assert.ok(turned.support.position.distanceTo(original.support.position.clone().applyQuaternion(turn)) < 1e-8);

  update(undefined, true, .08);
  update(undefined, true, .07);
  assert.equal(handling.braced, false);
  update(rest);
  assert.equal(handling.braced, false);
  update(rest, false);
  update(rest);
  assert.ok(handling.braced);
  handling.reset('shotgun', true);
  update(rest);
  assert.equal(handling.braced, false);
});

test('a braced shotgun uses the same solved barrel for the laser and the center pellet', () => {
  const handling = createGunHandling();
  const near = pose(weapon.position.clone().add(new Vector3(-.04, -.01, -.27)));
  const far = pose(weapon.position.clone().add(new Vector3(-.32, .15, -.32)));
  for (const lamp of [near, far])
    handling.updateBrace('shotgun', { weapon, lamp }, layout, settings, true, true, .3);
  const aim = mountedAim(handling.resolve({ weapon, lamp: far }, layout, view, settings, true).weapon, layout, view);
  assert.ok(aim.ray.x < -.5 && aim.ray.y > .2);
  const run = createRun('braced alignment', { populate: false });
  Object.assign(run.player, { y: 0, weapon: 'shotgun', ammo: 4 });
  Object.assign(run.world, { height: () => 0, raycast: (_, __, range) => range > 5 ? { t: 5, kind: 'stone' } : null });
  const predicted = traceAim(run, aim);
  const events = stepRun(run, { aim, fire: true });
  const shot = events.find(event => event.type === 'shot');
  const impact = events.find(event => event.type === 'impact');
  assert.ok(new Vector3(shot.ray.x, shot.ray.y, shot.ray.z).distanceTo(aim.ray) < 1e-8);
  assert.deepEqual([impact.x, impact.y, impact.z], [predicted.point.x, predicted.point.y, predicted.point.z]);
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
