import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEnemy, createRun, enemyPose, flarePower, hordeTarget, setLoot, stepRun, STEP } from '../src/simulation.js';
import { createWorld, START } from '../src/world.js';

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
