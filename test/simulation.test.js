import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEnemy, createRun, enemyPose, flarePower, hordeTarget, setLoot, shoot, stepRun, STEP, traceAim } from '../src/simulation.js';
import { animatedAnchors } from '../src/enemy-motion.js';
import { hordeSectors, OPENING_SECONDS } from '../src/horde.js';
import { createWorld, distance, START } from '../src/world.js';

function advance(run, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds / STEP) && run.status === 'playing'; i++)
    stepRun(run, typeof input === 'function' ? input(i) : input);
}

function room() {
  const run = createRun('test', { populate: false });
  const world = run.world;
  run.world = {
    ...world, height: () => 0, roadDistance: () => 0, around: () => [],
    blocks: () => false, raycast: () => null, clear: () => true,
    move(p, x, z) { p.x += x; p.z += z; },
  };
  run.player.y = 0;
  return run;
}

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

test('weapon swaps require confirmation and conserve the ammo pool', () => {
  const run = room(), p = run.player;
  setLoot(run, 'shotgun', p.x, p.z);
  stepRun(run);
  assert.equal(p.weapon, 'pistol');
  assert.equal(run.offer.kind, 'shotgun');
  stepRun(run, { interact: true });
  assert.equal(p.weapon, 'shotgun');
  assert.equal(p.ammo, 4);
  assert.equal(p.ammo + p.reserve, 56);
  const old = run.loot.find(l => l.kind === 'pistol');
  assert.equal(flarePower(run.time - old.born), 0);
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
  assert.equal(hordeTarget(300), 32);
  assert.equal(hordeTarget(540), 48);
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

test('the opening seeds every sector behind cover, without scripted convergence before 30 seconds', () => {
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
    const run = createRun('Blackwater', { crowdLimit:10 });
    let metAhead = false;
    for (let i = 0; i < 120 / STEP && run.status === 'playing'; i++) {
      const known = new Set(run.enemies.map(e => e.id));
      stepRun(run,{ yaw:0,moveZ });
      assert.ok(run.enemies.length <= 10);
      const p = run.player, view = { x:p.x,y:p.y+p.eyeHeight,z:p.z };
      for (const e of run.enemies) if (!known.has(e.id)) {
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
