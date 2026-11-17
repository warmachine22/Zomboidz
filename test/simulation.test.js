import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEnemy, createRun, ENEMIES, enemyPose, flarePower, GUNS, hordeTarget, inspectFlashlights, magazineCapacity,
  setLoot, shoot, signalFlarePower, stepRun, STEP, traceAim, visibleTargets } from '../src/simulation.js';
import { animatedAnchors } from '../src/enemy-motion.js';
import { hordeSectors, OPENING_SECONDS } from '../src/horde.js';
import { createWorld, distance, START } from '../src/world.js';

function advance(run, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds / STEP) && run.status === 'playing'; i++)
    stepRun(run, typeof input === 'function' ? input(i) : input);
}

function room(options = {}) {
  const run = createRun('test', { populate: false, ...options });
  const world = run.world;
  run.world = {
    ...world, height: () => 0, roadDistance: () => 0, around: () => [],
    blocks: () => false, raycast: () => null, clear: () => true,
    move(p, x, z) { p.x += x; p.z += z; },
  };
  run.player.y = 0;
  return run;
}

test('Legendary starts with two 50-round magazines and the mounted light keeps its charge', () => {
  const run = room({ legendary: true }), p = run.player;
  assert.deepEqual([p.ammo, p.offhand.ammo, p.reserve, magazineCapacity(p)], [50, 50, 50, 50]);
  stepRun(run, { toggleLight: true, toggleBeam: true, cycleWeapon: true });
  advance(run, 65);
  assert.deepEqual([p.flashlight, p.battery, p.beam, p.weapon], [true, 1, 'focus', 'pistol']);
  const standard = room().player;
  assert.deepEqual([standard.ammo, standard.offhand, magazineCapacity(standard)], [6, null, 6]);
});

test('Legendary lamps resolve independently, reveal targets and respect cover and tracking', () => {
  const run = room({ legendary: true }), p = run.player;
  const left = addEnemy(run, 'shambler', p.x - 9, p.z);
  const right = addEnemy(run, 'shambler', p.x + 9, p.z);
  left.nextThink = right.nextThink = 0;
  const light = side => ({ origin: { x:p.x + side * .25, y:1.4, z:p.z }, ray: { x:side, y:0, z:0 } });
  const input = { lamp: light(1), offhandLamp: light(-1) };
  stepRun(run, input);
  assert.deepEqual(run.beam.ray, input.lamp.ray);
  assert.deepEqual(run.offhandBeam.ray, input.offhandLamp.ray);
  assert.ok(visibleTargets(run).includes(left) && visibleTargets(run).includes(right));
  assert.equal(left.reason, 'flashlight');
  assert.equal(right.reason, 'flashlight');
  run.world.clear = (from, to) => !(from.x < 0 && to.x < p.x - 5);
  assert.deepEqual(visibleTargets(run).map(enemy => enemy.id), [right.id]);

  stepRun(run, { ...input, offhandUnavailable: true });
  assert.equal(run.offhandBeam, null);
  assert.ok(run.beam);
  run.world.clear = () => true;
  stepRun(run, { ...input, lampUnavailable: true });
  assert.equal(run.beam, null);
  assert.deepEqual(visibleTargets(run).map(enemy => enemy.id), [left.id]);

  const normal = room();
  stepRun(normal, input);
  assert.equal(normal.offhandBeam, null);
});

test('Legendary Wide, Focus and Off are independent and restore charge-free light when cycled back', () => {
  const run = room({ legendary: true }), p = run.player;
  stepRun(run, { cyclePrimaryBeam: true });
  assert.deepEqual([run.beam.mode, run.beam.range, run.offhandBeam.mode, run.offhandBeam.range],
    ['focus', 23, 'wide', 15]);
  assert.ok(run.beam.angle < run.offhandBeam.angle);

  stepRun(run, { cyclePrimaryBeam: true, cycleOffhandBeam: true });
  assert.equal(run.beam, null);
  assert.equal(run.offhandBeam.mode, 'focus');
  assert.equal(p.flashlight, true);

  stepRun(run, { cycleOffhandBeam: true });
  assert.equal(p.flashlight, false);
  assert.equal(run.beam, null);
  assert.equal(run.offhandBeam, null);
  advance(run, 8);
  assert.equal(p.battery, 1);

  stepRun(run, { toggleLight: true }); // F and the touch Light button cycle the offhand.
  assert.equal(run.beam, null);
  assert.equal(run.offhandBeam.mode, 'wide');
  stepRun(run, { toggleBeam: true }); // Q and the touch Beam button cycle the primary.
  assert.equal(run.beam.mode, 'wide');
  assert.equal(run.offhandBeam.mode, 'wide');

  const normal = room();
  stepRun(normal, { toggleBeam: true });
  assert.equal(normal.beam.mode, 'focus');
  stepRun(normal, { toggleBeam: true, cycleOffhandBeam: true });
  assert.equal(normal.beam.mode, 'wide');
  assert.equal(normal.offhandBeam, null);
});

test('the Legendary pistols aim and fire independently, with their own cooldowns', () => {
  const run = room({ legendary: true }), p = run.player;
  const left = addEnemy(run, 'shambler', p.x - 2, p.z - 6);
  const right = addEnemy(run, 'shambler', p.x + 2, p.z - 6);
  function aim(enemy, x) {
    const origin = { x, y: p.y + 1.6, z: p.z };
    const head = enemyPose(enemy).head;
    return { origin, ray: { x:head.x - origin.x, y:head.y - origin.y, z:head.z - origin.z } };
  }
  const offhandAim = aim(left, p.x - .23), mainAim = aim(right, p.x + .23);
  assert.equal(traceAim(run, offhandAim).e, left);
  assert.equal(traceAim(run, mainAim).e, right);
  const offhand = stepRun(run, { offhandFire: true, offhandAim }).find(event => event.type === 'shot');
  assert.ok(offhand.offhand && left.dead && !right.dead);
  const main = stepRun(run, { fire: true, aim: mainAim }).find(event => event.type === 'shot');
  assert.ok(main && !main.offhand && right.dead);
  assert.deepEqual([p.ammo, p.offhand.ammo, run.metrics.shots], [49, 49, 2]);
  advance(run, .33);
  stepRun(run, { fire: true, offhandFire: true, offhandUnavailable: true });
  assert.deepEqual([p.ammo, p.offhand.ammo], [48, 49]);
  advance(run, .33);
  const simultaneous = stepRun(run, { fire: true, offhandFire: true }).filter(event => event.type === 'shot');
  assert.deepEqual(simultaneous.map(event => event.offhand), [false, true]);
});

test('the Legendary pistols reload independently and conserve their shared spares', () => {
  const run = room({ legendary: true }), p = run.player;
  p.offhand.ammo = 1;
  p.reserve = 3;
  stepRun(run, { offhandFire: true });
  assert.ok(p.offhand.reload);
  assert.equal(p.reload, null);
  stepRun(run, { fire: true });
  assert.equal(p.ammo, 49);
  stepRun(run, { reload: true });
  assert.ok(p.reload && p.offhand.reload);
  advance(run, 1.6);
  assert.deepEqual([p.ammo, p.offhand.ammo, p.reserve], [49, 3, 0]);
  assert.equal(p.reload, null);
  assert.equal(p.offhand.reload, null);
});

test('only armor and ammo appear in Legendary timed, combat, and landmark loot', () => {
  const run = room({ legendary: true, populate: false }), p = run.player;
  run.world.around = () => [{ loot: ['shotgun', 'capacity', 'armor2', 'ammo'].map((kind, i) =>
    ({ kind, id: 'cache:' + i, x:p.x + 2 + i, z:p.z - 4, unlock: 0 })),
  }];
  run.populate = true;
  run.nextSpawn = Infinity;
  run.nextLoot = run.time = 100;
  run.rng = () => .2;
  stepRun(run);
  assert.deepEqual(run.loot.map(item => item.kind).sort(), ['ammo', 'ammo', 'armor2']);
  assert.equal(setLoot(run, 'carbine', p.x, p.z), null);
  assert.equal(setLoot(run, 'reload', p.x, p.z), null);
  const subject = addEnemy(run, 'shambler', p.x, p.z - 3);
  const origin = { x:p.x, y:p.y + 1.6, z:p.z }, at = enemyPose(subject).head;
  const rolls = [.5, .04, .3];
  run.rng = () => rolls.shift();
  shoot(run, { origin, ray: { x:at.x - origin.x, y:at.y - origin.y, z:at.z - origin.z } });
  assert.equal(p.kills, 1);
  assert.equal(run.loot.at(-1).kind, 'armor1');
});

test('a partial reload takes time, blocks fire, and only transfers available rounds', () => {
  const run = room(), p = run.player;
  p.ammo = 1; p.reserve = 2;
  stepRun(run, { reload: true });
  advance(run, 1.25, { fire: true });
  assert.equal(p.ammo, 1);
  assert.equal(p.reserve, 2);
  assert.equal(run.metrics.shots, 0);
  advance(run, .25);
  assert.equal(p.ammo, 3);
  assert.equal(p.reserve, 0);
  assert.equal(p.reload, null);
});

for (const [weapon, tiers] of Object.entries({
  pistol: [6, 12, 24, 50], shotgun: [4, 5, 6, 7], smg: [24, 28, 32, 36], carbine: [16, 20, 24, 28],
})) {
  test(weapon + ' reloads to the listed capacity at all four tiers', () => {
    const run = room(), p = run.player;
    if (weapon !== p.weapon) {
      setLoot(run, weapon, p.x, p.z);
      stepRun(run, { interact: true });
    }
    if (p.ammo === tiers[0]) { // Make room to exercise the base reload as well.
      advance(run, .3);
      stepRun(run, { fire: true });
    }
    for (const [tier, capacity] of tiers.entries()) {
      if (tier > 0) {
        const before = [p.ammo, p.reserve];
        setLoot(run, 'capacity', p.x, p.z);
        const pickup = stepRun(run).find(event => event.type === 'pickup');
        assert.equal(pickup.message, 'Extended Capacity · ' + capacity + (weapon === 'shotgun' ? ' shells' : ' rounds'));
        assert.deepEqual([p.ammo, p.reserve], before);
      }
      const pool = p.ammo + p.reserve;
      assert.equal(p.upgrades.capacity, tier);
      assert.equal(magazineCapacity(p), capacity);
      stepRun(run, { reload: true });
      assert.equal(p.reload.duration, GUNS[weapon].reload);
      advance(run, p.reload.duration);
      assert.equal(p.ammo, capacity);
      assert.equal(p.reserve, pool - capacity);
      stepRun(run, { reload: true });
      assert.equal(p.reload, null);
    }
    assert.equal(magazineCapacity({ ...room().player, weapon }), tiers[0]);
  });
}

test('the max-tier pistol fires all 50 rounds, and a fourth pickup has no effect', () => {
  const run = room(), p = run.player;
  for (let i = 0; i < 4; i++) {
    setLoot(run, 'capacity', p.x, p.z);
    stepRun(run);
  }
  assert.equal(p.upgrades.capacity, 3);
  assert.equal(run.metrics.pickups.capacity, 3);
  assert.deepEqual([p.ammo, p.reserve], [6, 50]);
  stepRun(run, { reload: true });
  advance(run, GUNS.pistol.reload);
  for (let shot = 1; shot <= 50; shot++) {
    const events = stepRun(run, { fire: true });
    assert.equal(run.metrics.shots, shot);
    assert.equal(p.ammo, 50 - shot);
    assert.equal(events.some(event => event.type === 'reload'), shot === 50);
    advance(run, Math.ceil(GUNS.pistol.interval / STEP) * STEP);
  }
  assert.equal(p.reserve, 6);
  assert.ok(p.reload);
  advance(run, GUNS.pistol.reload);
  assert.deepEqual([p.ammo, p.reserve], [6, 0]);
  const fresh = room().player;
  assert.deepEqual([fresh.upgrades.capacity, fresh.ammo, fresh.reserve], [0, 6, 50]);
});

test('capacity follows carried weapons, and reloads retain Speed Loader and reserve limits', () => {
  const run = room(), p = run.player;
  for (const kind of ['capacity', 'capacity', 'reload']) setLoot(run, kind, p.x, p.z);
  stepRun(run);
  stepRun(run, { reload: true });
  assert.equal(p.reload.duration, GUNS.pistol.reload * .85);
  advance(run, 1.3);
  assert.equal(p.ammo, 24);
  setLoot(run, 'shotgun', p.x, p.z);
  stepRun(run, { interact: true });
  assert.deepEqual([p.weapon, p.upgrades.capacity, p.ammo, p.reserve], ['shotgun', 2, 0, 32]);
  assert.equal(p.reload.duration, GUNS.shotgun.reload * .85);
  advance(run, 1.9);
  assert.deepEqual([p.ammo, p.reserve], [6, 26]);
  stepRun(run, { cycleWeapon: true });
  assert.deepEqual([p.weapon, p.upgrades.capacity, p.ammo, p.reserve], ['pistol', 2, 24, 26]);
  p.ammo = 6;
  p.reserve = 3;
  stepRun(run, { reload: true });
  advance(run, 1.3);
  assert.deepEqual([p.ammo, p.reserve], [9, 0]);
});

test('timed and combat loot can drop Extended Capacity only below its cap', () => {
  for (const tier of [2, 3]) {
    const run = room(), p = run.player;
    for (let i = 0; i < tier; i++) {
      setLoot(run, 'capacity', p.x, p.z);
      stepRun(run);
    }
    run.populate = true;
    run.nextLoot = 0;
    run.nextSpawn = Infinity;
    run.rng = () => .8;
    stepRun(run);
    assert.equal(run.loot.some(item => item.kind === 'capacity' && !item.lost), tier < 3);

    const enemy = addEnemy(run, 'shambler', p.x, p.z - 3);
    const origin = { x:p.x, y:p.y + 1.6, z:p.z };
    const head = enemyPose(enemy).head;
    const values = [.5, .04, .8];
    run.rng = () => values.shift();
    const before = run.loot.length;
    shoot(run, { origin, ray: { x:head.x - origin.x, y:head.y - origin.y, z:head.z - origin.z } });
    assert.equal(run.player.kills, 1);
    assert.equal(run.loot.length, before + 1);
    assert.equal(run.loot.at(-1).kind === 'capacity', tier < 3);
  }
});

test('battery lasts 30 seconds, recharges in five, and gets a longer runtime from loot', () => {
  const run = room(), p = run.player;
  advance(run, 29.9);
  assert.equal(p.flashlight, true);
  advance(run, .1);
  assert.equal(p.flashlight, false);
  advance(run, 5);
  assert.equal(p.battery, 1);
  setLoot(run, 'battery', p.x, p.z);
  stepRun(run);
  assert.equal(p.upgrades.battery, 1);
  stepRun(run, { toggleLight: true });
  advance(run, 31);
  assert.equal(p.flashlight, true);
});

test('weapon pickups require confirmation, and cycling retains each magazine in pickup order', () => {
  const run = room(), p = run.player;
  assert.deepEqual(p.magazines, { pistol: 6, flaregun: 1 });
  setLoot(run, 'shotgun', p.x, p.z);
  stepRun(run);
  assert.equal(p.weapon, 'pistol');
  assert.equal(run.offer.kind, 'shotgun');
  stepRun(run, { interact: true });
  assert.equal(p.weapon, 'shotgun');
  assert.equal(p.ammo, 0);
  assert.equal(p.magazines.pistol, 6);
  advance(run, GUNS.shotgun.reload);
  assert.deepEqual([p.ammo, p.reserve], [4, 46]);
  for (const kind of ['smg', 'carbine']) {
    setLoot(run, kind, p.x, p.z);
    stepRun(run, { interact: true });
    assert.equal(p.weapon, kind);
    assert.equal(p.ammo, 0);
    advance(run, GUNS[kind].reload);
  }
  assert.equal(run.loot.some(item => item.kind === 'pistol'), false);
  setLoot(run, 'shotgun', p.x, p.z);
  stepRun(run, { interact: true });
  assert.equal(run.offer, null);
  assert.equal(p.weapon, 'carbine');
  assert.equal(run.metrics.pickups.shotgun, 1);
  for (const [kind, rounds] of Object.entries({ pistol: 6, flaregun: 1, shotgun: 4, smg: 24, carbine: 16 })) {
    const events = stepRun(run, { cycleWeapon: true, fire: true });
    assert.ok(events.some(event => event.type === 'weaponSwitch' && event.weapon === kind));
    assert.equal(p.weapon, kind);
    assert.equal(p.ammo, rounds);
    assert.equal(run.metrics.shots, 0);
  }
  assert.equal(p.magazines.pistol + p.magazines.shotgun + p.magazines.smg + p.magazines.carbine + p.reserve, 56);
  assert.deepEqual(room().player.magazines, { pistol: 6, flaregun: 1 });
});

test('cycling out of a mid-reload weapon preserves both magazines and spares', () => {
  const run = room(), p = run.player;
  setLoot(run, 'shotgun', p.x, p.z);
  stepRun(run, { interact: true });
  advance(run, .65);
  assert.equal(p.reload.weapon, 'shotgun');
  stepRun(run, { cycleWeapon: true });
  advance(run, 3);
  assert.equal(p.weapon, 'pistol');
  assert.equal(p.reload, null);
  assert.deepEqual(p.magazines, { pistol: 6, flaregun: 1, shotgun: 0 });
  assert.equal(p.reserve, 50);
  stepRun(run, { cycleWeapon: true });
  stepRun(run, { cycleWeapon: true });
  assert.equal(p.reload.left, GUNS.shotgun.reload);
});

test('the flare gun starts with 20 flares and reloads from its own scavengeable reserve', () => {
  const run = room(), p = run.player;
  assert.equal(p.magazines.flaregun + p.flares, 20);
  assert.equal(room({ difficulty: 'hard' }).player.flares, 19);
  const legendary = room({ legendary: true });
  assert.equal(legendary.player.magazines.flaregun, undefined);
  assert.equal(setLoot(legendary, 'flareAmmo', 0, 20), null);
  stepRun(run, { cycleWeapon: true });
  assert.equal(p.weapon, 'flaregun');
  advance(run, .30);
  stepRun(run, { fire: true });
  assert.deepEqual([p.ammo, p.flares, p.reserve, p.magazines.pistol], [0, 19, 50, 6]);
  assert.equal(p.reload.weapon, 'flaregun');
  advance(run, GUNS.flaregun.reload);
  assert.deepEqual([p.ammo, p.flares], [1, 18]);
  assert.equal(run.metrics.shots, 0);
  p.flares = 0;
  stepRun(run, { fire: true });
  assert.equal(p.ammo, 0);
  assert.equal(p.reload, null);
  setLoot(run, 'flareAmmo', p.x, p.z, undefined, 4);
  assert.ok(!run.events.some(event => event.type === 'flare'));
  assert.ok(stepRun(run).some(event => event.message === '+4 flares'));
  advance(run, GUNS.flaregun.reload);
  assert.deepEqual([p.ammo, p.flares, p.reserve], [1, 3, 50]);
});

test('a launched flare follows a ballistic path, attracts some zombies and burns out after ten seconds', () => {
  const run = room(), p = run.player;
  p.flashlight = false;
  p.protection = 30;
  run.world.raycast = (o, ray, range) => {
    const t = -o.y / ray.y;
    return ray.y < 0 && t >= 0 && t <= range ? { kind: 'earth', t } : null;
  };
  stepRun(run, { cycleWeapon: true });
  advance(run, .30);
  const aim = { origin: { x: p.x, y: 1.6, z: p.z }, ray: { x: 0, y: 0, z: -1 } };
  const expected = traceAim(run, aim).point;
  const close = addEnemy(run, 'shambler', p.x + 2.6, p.z);
  close.stun = 30;
  for (let i = 0; i < 10; i++) addEnemy(run, 'shambler', expected.x + i - 5, expected.z - 4);
  stepRun(run, { fire: true, aim });
  assert.equal(run.signalFlares.length, 1);
  assert.equal(run.signalFlares[0].landed, false);
  assert.ok(run.enemies.every(e => e.hp === ENEMIES[e.kind].hp));
  advance(run, .9);
  const flare = run.signalFlares[0];
  assert.ok(flare.landed);
  assert.ok(Math.abs(expected.z - flare.z) < .2);
  assert.ok(distance(flare, p) > 8 && distance(flare, p) < 13);
  assert.equal(signalFlarePower(run.time - flare.born), 1);
  const diverted = run.enemies.filter(e => e.reason === 'signal flare');
  assert.ok(diverted.length >= 2 && diverted.length <= 6);
  assert.equal(close.target.id, 'player');
  advance(run, 6);
  assert.equal(run.status, 'playing');
  assert.ok(signalFlarePower(run.time - flare.born) < .7);
  advance(run, 4);
  assert.equal(run.signalFlares.length, 0);
  assert.ok(run.enemies.every(e => e.reason !== 'signal flare'));
});

test('solid cover intercepts the flare and hides it from zombies behind the wall', () => {
  const run = room(), p = run.player;
  p.flashlight = false;
  const wall = p.z - 3;
  run.world.raycast = (o, ray, range) => {
    const t = (wall - o.z) / ray.z;
    return t >= 0 && t <= range ? { kind: 'wall', t } : null;
  };
  run.world.clear = (a, b) => (a.z < wall) === (b.z < wall);
  stepRun(run, { cycleWeapon: true });
  advance(run, .30);
  const zombie = addEnemy(run, 'shambler', p.x, wall - 2);
  const visible = addEnemy(run, 'shambler', p.x + 4, wall + 1);
  stepRun(run, { fire: true, aim: { origin: { x: p.x, y: 1.6, z: p.z }, ray: { x: 0, y: 0, z: -1 } } });
  advance(run, .9);
  assert.ok(run.signalFlares[0].landed);
  assert.ok(run.signalFlares[0].z > wall);
  assert.equal(run.signalFlares[0].y, .13);
  assert.equal(visible.reason, 'signal flare');
  assert.notEqual(zombie.reason, 'signal flare');
});

test('the last shot stays empty without spares and picking up ammo starts the reload', () => {
  const run = room(), p = run.player;
  p.ammo = 1;
  p.reserve = 0;
  stepRun(run, { fire: true });
  assert.equal(p.ammo, 0);
  assert.equal(p.reload, null);
  advance(run, .34);
  const events = stepRun(run, { fire: true });
  assert.equal(events.find(event => event.type === 'dry').reason, 'No spare rounds');
  setLoot(run, 'ammo', p.x, p.z, undefined, 3);
  stepRun(run);
  assert.equal(p.reload.left, GUNS.pistol.reload);
  assert.deepEqual([p.ammo, p.reserve], [0, 3]);
  advance(run, GUNS.pistol.reload);
  assert.deepEqual([p.ammo, p.reserve], [3, 0]);
});

test('the Ranger carbine enters rare loot at 90 seconds and fires semi-auto with a two-second reload', () => {
  const run = room(), p = run.player;
  run.populate = true;
  run.rng = () => .99;
  run.nextSpawn = Infinity;
  run.nextLoot = run.time = 89;
  stepRun(run);
  assert.ok(run.loot.every(item => item.kind !== 'carbine'));
  run.nextLoot = run.time = 90;
  stepRun(run);
  const carbine = run.loot.find(item => item.kind === 'carbine');
  assert.ok(carbine);
  Object.assign(carbine, { x: p.x, z: p.z });
  stepRun(run, { interact: true });
  assert.equal(p.weapon, 'carbine');
  assert.equal(p.ammo, 0);
  assert.equal(p.reload.duration, 2);
  advance(run, 2);
  stepRun(run, { fire: true });
  advance(run, .6, { fireHeld: true });
  assert.equal(p.ammo, 15);
  assert.equal(run.metrics.shots, 1);
  stepRun(run, { reload: true });
  advance(run, 1.9, { fire: true });
  assert.equal(p.ammo, 15);
  advance(run, .1);
  assert.equal(p.ammo, 16);
  assert.equal(p.reserve, 33);
  assert.equal(p.magazines.pistol, 6);
});

test('the flashlight keeps its charge when tracking is briefly unavailable', () => {
  const run = room(), p = run.player;
  const lamp = { origin: { x: 0, y: 1.3, z: 20 }, ray: { x: 1, y: 0, z: 0 } };
  advance(run, .5, { lamp, lampUnavailable: true, weaponUnavailable: true, fire: true });
  assert.equal(run.beam, null);
  assert.equal(p.battery, 1);
  assert.equal(p.ammo, 6);
  stepRun(run, { lamp });
  assert.deepEqual(run.beam.ray, lamp.ray);
  assert.ok(p.battery < 1 && p.flashlight);
  stepRun(run, { lamp, toggleLight: true });
  assert.equal(p.flashlight, false);
  assert.equal(p.battery, 1);
});

test('a clean unarmored hit kills after a windup, and armor absorbs exactly three hits', () => {
  const run = room(), p = run.player;
  setLoot(run, 'armor3', p.x, p.z);
  stepRun(run, { interact: true });
  addEnemy(run, 'shambler', p.x, p.z - .83);
  advance(run, .37);
  assert.equal(p.armor, 3);
  assert.equal(run.status, 'playing');
  advance(run, .45);
  assert.equal(p.armor, 2);
  advance(run, 8);
  assert.equal(p.armor, 0);
  assert.equal(run.status, 'dead');
  assert.equal(run.metrics.damage.shambler, 4);
});

test('the fatal attacker and world stay at the hit while inspection keeps flashlight controls available', () => {
  for (const legendary of [false, true]) {
    const run = room({ legendary }), p = run.player;
    const attacker = addEnemy(run, 'shambler', p.x, p.z + .84);
    inspectFlashlights(run, { toggleBeam: true });
    assert.equal(p.beam, 'wide', 'inspection controls only apply once the run is over');
    advance(run, 1.2);
    assert.equal(run.status, 'dead');
    assert.deepEqual(run.death.attacker, {
      id: attacker.id, x: attacker.x, y: attacker.y + ENEMIES.shambler.height, z: attacker.z,
    });
    assert.ok(Math.abs(run.death.yaw) > 2.35);

    const snapshot = [run.time, p.x, p.y, p.z, p.ammo, p.reserve, p.kills, attacker.x, attacker.z, attacker.attackAge];
    stepRun(run, { fire: true, offhandFire: true, reload: true, moveX: 1, moveZ: 1 });
    const charge = p.battery;
    inspectFlashlights(run, { toggleBeam: true });
    if (legendary) {
      inspectFlashlights(run, { cycleOffhandBeam: true });
      assert.equal(p.offhand.beam, 'focus');
    } else {
      inspectFlashlights(run, { toggleLight: true });
      assert.equal(p.flashlight, false);
    }
    assert.equal(p.beam, 'focus');
    assert.equal(p.battery, charge);
    assert.deepEqual([run.time, p.x, p.y, p.z, p.ammo, p.reserve, p.kills, attacker.x, attacker.z, attacker.attackAge], snapshot);
    assert.equal(run.metrics.shots, 0);
  }
});

test('piercing carries damage to an additional target while cover stops it', () => {
  const run = room(), p = run.player;
  p.upgrades.pierce = 1;
  p.flashlight = false;
  const first = addEnemy(run, 'shambler', p.x, p.z - 5);
  const second = addEnemy(run, 'shambler', p.x, p.z - 8);
  const covered = addEnemy(run, 'shambler', p.x, p.z - 13);
  const { torso } = enemyPose(first);
  run.world.raycast = () => ({ t: 10, kind: 'bark' });
  stepRun(run, { fire: true, aim: { origin: { x: p.x, y: torso.y, z: p.z }, ray: { x: 0, y: 0, z: -1 } } });
  assert.ok(first.hp < 3.2);
  assert.ok(second.hp < 3.2 && second.hp > first.hp);
  assert.equal(covered.hp, 3.2);
});

test('fresh special loot divides a gunshot pursuit and loses influence as it fades', () => {
  const run = room(), p = run.player;
  p.flashlight = false;
  const item = setLoot(run, 'armor2', 0, 4);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    addEnemy(run, 'shambler', 5 * Math.sin(a), 4 + 5 * Math.cos(a));
  }
  advance(run, .6, () => ({}));
  stepRun(run, { fire: true, aim: { origin: { x:0,y:1.2,z:20 }, ray: { x:0,y:0,z:1 } } });
  advance(run, .7);
  const diverted = run.enemies.filter(e => e.reason === 'loot flare');
  assert.ok(diverted.length >= 1 && diverted.length <= 3);
  assert.ok(run.enemies.some(e => e.reason.includes('gunshot')));
  assert.equal(flarePower(5), 1);
  assert.equal(flarePower(15), .5);
  assert.equal(flarePower(25), 0);
  run.time += 30;
  advance(run, 1);
  assert.ok(run.enemies.every(e => e.reason !== 'loot flare'));
  assert.ok(run.loot.includes(item));
});

test('terrain repeats by seed and never reactivates an already looted cache', () => {
  const a = createWorld('woods'), b = createWorld('woods'), c = createWorld('different');
  assert.deepEqual(a.chunk(-1, 0), b.chunk(-1, 0));
  assert.notDeepEqual(a.chunk(-1, 0).trees, c.chunk(-1, 0).trees);
  const sharedX = -48;
  assert.ok(Math.abs(a.height(sharedX - 1e-7, 3) - a.height(sharedX + 1e-7, 3)) < 1e-6);
  const run = createRun('woods', { populate: false });
  const item = run.world.chunk(0, 0).loot.find(l => l.kind === 'ammo');
  assert.equal(run.player.x, START.x);
  run.time = 20;
  Object.assign(run.player, { x: item.x, z: item.z });
  stepRun(run);
  assert.ok(run.settledLoot.has(item.id));
  Object.assign(run.player, { x: 196, z: 231 });
  advance(run, 1);
  Object.assign(run.player, { x: item.x, z: item.z });
  advance(run, 1);
  assert.ok(!run.loot.some(d => d.id === item.id));
  assert.equal(hordeTarget(0), 10);
  assert.equal(hordeTarget(390), 32);
  assert.equal(hordeTarget(660), 48);
});

function aimFrom(origin, target) {
  const x = target.x-origin.x, y = target.y-origin.y, z = target.z-origin.z;
  const d = Math.hypot(x,y,z);
  return { origin, ray:{ x:x/d, y:y/d, z:z/d } };
}

test('pistol and laser share a first hit on an animated enemy at close and clearing distances', () => {
  for (const gap of [2.8, 24]) {
    const run = room(), p = run.player;
    const enemy = addEnemy(run, 'shambler', p.x, p.z-gap);
    const rest = enemyPose(enemy).head;
    enemy.stumbleDuration = .8; enemy.stumble = .39;
    const { head } = enemyPose(enemy);
    assert.ok(Math.abs(head.y-rest.y) > .035);
    const aim = aimFrom({ x:p.x,y:1.48,z:p.z },head);
    const dot = traceAim(run,aim);
    assert.equal(dot.zone,'head');
    shoot(run,aim);
    const hit = run.events.find(e => e.type === 'impact');
    assert.deepEqual({ x:hit.x,y:hit.y,z:hit.z },dot.point);
    assert.equal(p.headshots,1);
  }
});

test('a shot through the outer skull registers and kills any of the three zombies in one hit', () => {
  for (const kind of ['shambler','shrieker','brute']) {
    const run=room(), p=run.player;
    const enemy=addEnemy(run,kind,p.x,p.z-7);
    enemy.stride=.78;
    enemy.gait=2.1;
    const {head}=enemyPose(enemy);
    const side=kind==='brute'?.176:.128;
    const edge={...head,x:head.x+side};
    const aim=aimFrom({...edge,z:p.z},edge);
    assert.equal(traceAim(run,aim)?.zone,'head',kind);
    shoot(run,aim);
    assert.equal(enemy.dead,true,kind);
    assert.equal(p.headshots,1,kind);
  }
});

test('visible reaching arms can take a hit', () => {
  const run = room(), p = run.player;
  const enemy = addEnemy(run, 'shrieker', p.x, p.z-4);
  enemy.stumbleDuration = .6; enemy.stumble = .32;
  const wrist = animatedAnchors(enemy,.38)[6];
  const aim = aimFrom({ x:p.x-.6,y:wrist.y,z:p.z },wrist);
  assert.equal(traceAim(run,aim).zone,'arm');
  shoot(run,aim);
  assert.ok(enemy.hp < 2.4);
  assert.equal(p.headshots,0);
});

test('a tracked gun pushed through cover still hits the near side at the laser dot', () => {
  const run = room(), p = run.player;
  const e = addEnemy(run,'shambler',p.x,p.z-6);
  const aim = { ...aimFrom({x:p.x,y:1.45,z:p.z-2}, enemyPose(e).head),
    viewOrigin:{x:p.x,y:1.63,z:p.z} };
  run.world.raycast = (origin, ray, range) => {
    const t = (p.z-1-origin.z)/ray.z;
    return t >= 0 && t <= range ? { t, kind:'houseSide' } : null;
  };
  const dot = traceAim(run,aim);
  assert.equal(dot.zone,'cover');
  shoot(run,aim);
  const impact = run.events.find(e => e.type === 'impact');
  assert.deepEqual({ x:impact.x,y:impact.y,z:impact.z },dot.point);
  assert.equal(e.hp,3.2);
  assert.equal(p.ammo,5);
});

test('the opening seeds every sector behind cover before scripted convergence', () => {
  for (const seed of ['Blackwater','Cold Creek','Split Pine','Rain Line']) {
    const run = createRun(seed), { player:p, world } = run;
    assert.equal(run.enemies.length,10);
    assert.ok(hordeSectors(run).every(count => count > 0));
    const view = { x:p.x,y:p.y+p.eyeHeight,z:p.z };
    for (const e of run.enemies) {
      assert.ok(distance(p,e) >= 25);
      assert.equal(world.clear(view,{x:e.x,y:e.y+1.78,z:e.z}),false);
      assert.ok(e.approach.at >= OPENING_SECONDS);
    }
  }
});

test('unbroken forward motion and backpedaling draw covered interceptions without exceeding the cap', () => {
  for (const moveZ of [-1,1]) {
    const run = createRun('Reed Valley', { crowdLimit:10 });
    let metAhead = false;
    for (let i = 0; i < 225 / STEP && run.status === 'playing'; i++) {
      const known = new Set(run.enemies.map(e => e.id));
      stepRun(run,{ yaw:0,moveZ });
      assert.ok(run.enemies.length <= 10);
      const p = run.player, view = { x:p.x,y:p.y+p.eyeHeight,z:p.z };
      for (const e of run.enemies) if (!known.has(e.id) && e.spawn) {
        const { x,z } = e.spawn, body = {x,z,y:run.world.height(x,z)+1.18};
        assert.ok(distance(p,{x,z}) >= 13);
        assert.equal(run.world.clear(view,body),false);
        const b = run.beam, dx = body.x-b.origin.x, dy=body.y-b.origin.y, dz=body.z-b.origin.z;
        if (p.flashlight && Math.hypot(dx,dy,dz)<15 &&
          dx*b.ray.x+dy*b.ray.y+dz*b.ray.z > Math.cos(.49)*Math.hypot(dx,dy,dz))
          assert.equal(run.world.clear(b.origin,body),false);
        if (run.time > OPENING_SECONDS && (z-p.z)*moveZ > 9) metAhead = true;
      }
    }
    assert.ok(metAhead);
    assert.equal(run.status,'dead');
  }
});
