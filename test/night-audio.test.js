import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threatMix, voicePriority } from '../src/audio.js';
import { canopyMask, moonDirection } from '../src/night-lighting.js';
import { addEnemy, createRun, resolvedBeam, STEP, stepRun } from '../src/simulation.js';
import { CHUNK, createWorld } from '../src/world.js';

test('the eye-to-lens obstruction keeps both the rendered and simulated beam on the near side', () => {
  const lamp = { origin: { x: 0, y: 1.3, z: -.8 }, ray: { x: 0, y: 0, z: -1 } };
  const eye = { x: 0, y: 1.3, z: 0 };
  assert.equal(resolvedBeam({ raycast: () => null }, lamp, eye), lamp);
  const near = resolvedBeam({ raycast: () => ({ t: .43, kind: 'stone' }) }, lamp, eye);
  assert.equal(near.origin.z, -.31);
  assert.equal(near.ray, lamp.ray);
  assert.equal(resolvedBeam({ raycast: () => ({ t: .09, kind: 'stone' }) }, lamp, eye), null);
});

test('sky and moon shade differ under a tree and stay stable across chunk changes', () => {
  const tree = { x: 20, z: 23, r: .4, height: 9 };
  const world = { chunk: (x, z) => ({ trees: x === 0 && z === 0 ? [tree] : [] }) };
  const size = CHUNK * 3;
  const sample = (map, cx, x, z, channel) =>
    map[(Math.floor(z + CHUNK) * size + Math.floor(x - (cx - 1) * CHUNK)) * 4 + channel];
  const first = new Uint8Array(size * size * 4), second = first.slice();
  canopyMask(world, 0, 0, first);
  canopyMask(world, 1, 0, second);
  const projection = tree.height * .47 / moonDirection.y;
  const shadowX = tree.x - projection * moonDirection.x;
  const shadowZ = tree.z - projection * moonDirection.z;
  assert.equal(sample(first, 0, 2, 2, 0), 255);
  assert.ok(sample(first, 0, tree.x, tree.z, 0) < 50);
  assert.ok(sample(first, 0, shadowX, shadowZ, 1) < 50);
  assert.equal(sample(first, 0, shadowX, shadowZ, 1), sample(second, 1, shadowX, shadowZ, 1));
});

test('the roadside wreck has two lens emitters with low beams and the shelter shines downward', () => {
  const world = createWorld('Blackwater');
  const headlights = world.chunk(0, 0).lights.filter(light => light.type === 'wreck');
  assert.equal(headlights.length, 2);
  assert.ok(Math.abs(headlights[1].x - headlights[0].x - 1.28) < .001);
  assert.ok(headlights.every(light => light.ray.z > .98 && light.ray.y < 0 && light.radius > 15));
  assert.ok(world.chunk(0, -1).lights.some(light => light.type === 'shelter' && light.ray.y < -.9));
});

test('a walker cues promptly on approach and keeps growling up close', () => {
  const run = createRun('voice check', { populate: false });
  Object.assign(run.world, {
    height: () => 0, move() {}, blocks: () => false, raycast: () => null, clear: () => true,
    around: () => [],
  });
  const p = run.player;
  const zombie = addEnemy(run, 'shambler', p.x, p.z - 18);
  const voices = () => stepRun(run).filter(e => e.type === 'voice');
  assert.ok(voices().some(e => e.id === zombie.id));
  zombie.z = p.z - 11.8;
  const entered = run.time;
  let approachAt;
  for (let i = 0; i < Math.ceil(.51 / STEP); i++) {
    if (voices().some(e => e.id === zombie.id)) { approachAt = run.time; break; }
  }
  assert.ok(approachAt - entered <= .51);
  zombie.z = p.z - 4.5;
  const near = [];
  for (let i = 0; i < 6 / STEP; i++) if (voices().length) near.push(run.time);
  assert.ok(near.length >= 4);
  for (let i = 1; i < near.length; i++) assert.ok(near[i] - near[i - 1] <= 1.54);
});

test('live threat gain increases on approach, cover muffles, and close threats outrank distant calls', () => {
  const [near, middle, far] = [4, 10, 18].map(distance => threatMix(distance, false));
  assert.ok(near.gain > middle.gain && middle.gain > far.gain && far.gain > 0);
  const covered = threatMix(4, true);
  assert.ok(covered.gain > 0 && covered.gain < near.gain && covered.cutoff < near.cutoff);
  assert.equal(threatMix(22, false).gain, 0);
  assert.ok(voicePriority('voice', 4) > voicePriority('shriek', 14));
  assert.ok(voicePriority('windup', 4) > voicePriority('voice', 4));
});
