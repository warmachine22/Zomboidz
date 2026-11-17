import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, CHUNK, hash, START } from '../src/world.js';
import { DRESSING, TRIS, fireflyField, inFireflyPocket, isSnag, setDressingEnabled } from '../src/dressing.js';
import { snapshot } from '../scripts/golden-snapshot.mjs';
import { kit, kitKinds, grassGeometry, shrubGeometry } from '../src/kit.js';

const SEEDS = ['d-1', 'd-2', 'd-3'];
const each = (fn, range = 8) => {
  for (const seed of SEEDS) {
    const world = createWorld(seed);
    for (let cz = -range; cz < range; cz++) for (let cx = -range; cx < range; cx++) fn(world.chunk(cx, cz), world, seed);
  }
};

test('1.1.0 scenery leaves every 1.0.17 seed layout byte-identical', () => {
  const gold = JSON.parse(readFileSync(new URL('./fixtures/world-1.0.17.json', import.meta.url), 'utf8'));
  const now = snapshot();
  for (const key of Object.keys(gold)) assert.equal(now[key], gold[key], key);
});

test('dressing is deterministic and can be switched off without changing anything else', () => {
  const a = createWorld('det').chunk(3, -2), b = createWorld('det').chunk(3, -2);
  assert.deepEqual(a.decor, b.decor);
  setDressingEnabled(false);
  try {
    const off = createWorld('det').chunk(3, -2);
    assert.equal(off.decor, undefined);
    assert.equal(off.colliders.length, a.colliders.filter(c => !c.decor).length);
  } finally { setDressingEnabled(true); }
});

test('every chunk stays inside the triangle, collider and draw-call budgets', () => {
  let tris = 0, chunks = 0;
  each(area => {
    const d = area.decor; chunks++; tris += d.triangles;
    assert.ok(d.triangles <= DRESSING.budgets.triangles, 'triangles ' + d.triangles);
    assert.ok(d.colliders <= DRESSING.budgets.colliders, 'colliders ' + d.colliders);
  });
  assert.ok(tris / chunks < 3500, 'average triangles per chunk ' + tris / chunks);
});

test('TRIS table matches the real kit geometry', () => {
  for (const kind of kitKinds) {
    if (!(kind in TRIS)) continue;
    for (const variant of [0, 1, 2, 3, 4]) {
      const g = kit(kind, variant);
      const budget = kind === 'rock' && variant === 4 ? TRIS.rockSplit : TRIS[kind];
      assert.ok(g.userData.tris <= budget, kind + ' v' + variant + ' has ' + g.userData.tris + ' tris, table says ' + budget);
    }
  }
  assert.ok(grassGeometry.attributes.position.count / 3 <= TRIS.grass);
  assert.ok(shrubGeometry.attributes.position.count / 3 <= TRIS.shrub);
});

test('scenery keeps clear of spawn, loot, entrances and building sites', () => {
  each((area, world) => {
    const d = area.decor, solid = [...d.rocks.map(r => ({ ...r, r: r.sx })), ...d.remains, ...d.vehicles, ...d.logs];
    for (const o of solid) {
      assert.ok(Math.hypot(o.x - START.x, o.z - START.z) > 9, 'too close to START');
      for (const l of area.loot) assert.ok(Math.hypot(o.x - l.x, o.z - l.z) > .6, 'on loot ' + o.kind);
      for (const e of area.entrances) assert.ok(Math.hypot(o.x - e.x, o.z - e.z) > .9, 'on entrance ' + o.kind);
      assert.ok(o.x >= area.cx * CHUNK && o.x < (area.cx + 1) * CHUNK && o.z >= area.cz * CHUNK && o.z < (area.cz + 1) * CHUNK, 'outside chunk');
    }
    for (const b of area.buildings) for (const o of d.vehicles) assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > 8, 'vehicle inside building site');
  }, 5);
});

test('barrier logs never trap: a route around exists and collisions match', () => {
  let barriers = 0;
  for (const seed of SEEDS) {
    const world = createWorld(seed);
    for (let cz = -10; cz < 10; cz++) for (let cx = -10; cx < 10; cx++) {
      const area = world.chunk(cx, cz);
      for (const log of area.decor.logs.filter(l => l.barrier)) {
        barriers++;
        // Walk a 0.5 m grid from 8 m one side of the trunk to 8 m the other side (perpendicular to
        // the trunk) with the player radius. Breadth-first search must reach the far side.
        const dx = Math.cos(log.yaw), dz = -Math.sin(log.yaw), px = -dz, pz = dx;
        const start = { x: log.x - px * 8, z: log.z - pz * 8 }, goal = { x: log.x + px * 8, z: log.z + pz * 8 };
        const cell = .5, key = (i, j) => i + ',' + j, seen = new Set(), queue = [[0, 0]];
        const at = (i, j) => ({ x: start.x + i * cell, z: start.z + j * cell });
        seen.add('0,0');
        if (world.blocks(start.x, start.z, .26)) continue; // start inside a tree: skip, not the log's fault
        let reached = false;
        while (queue.length && !reached) {
          const [i, j] = queue.shift();
          for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + a, nj = j + b, p = at(ni, nj);
            if (seen.has(key(ni, nj)) || Math.hypot(p.x - log.x, p.z - log.z) > 14) continue;
            seen.add(key(ni, nj));
            if (world.blocks(p.x, p.z, .26)) continue;
            if (Math.hypot(p.x - goal.x, p.z - goal.z) < 1) reached = true;
            queue.push([ni, nj]);
          }
        }
        assert.ok(reached || world.blocks(goal.x, goal.z, .26), 'barrier traps at ' + log.x.toFixed(1) + ',' + log.z.toFixed(1));
        // The trunk really blocks movement at its centre, as drawn.
        assert.ok(world.blocks(log.x, log.z, .26), 'collider missing under trunk');
        assert.equal(world.raycast({ x: log.x - px * 1.5, y: log.y, z: log.z - pz * 1.5 }, { x: px, y: 0, z: pz }, 3, false)?.kind, 'log');
      }
    }
  }
  assert.ok(barriers > 20, 'expected barriers to exist, saw ' + barriers);
});

test('small scenery does not collide: no collider for grass, pebbles, small rocks or remains', () => {
  each(area => {
    const decorColliders = area.colliders.filter(c => c.decor);
    assert.equal(decorColliders.length, area.decor.colliders);
    for (const c of decorColliders) {
      assert.ok(['log', 'wreck', 'stone'].includes(c.kind));
      assert.ok((c.r ?? Math.max(c.rx, c.rz)) <= 3.5, 'exceeds 3.5m raycast padding');
    }
    for (const r of area.decor.rocks) assert.ok(r.collides || r.sy <= .72, 'tall rock missing collider');
  }, 4);
});

test('frequencies stay in the intended range', () => {
  const counts = { chunks: 0, carcass: 0, person: 0, vehicle: 0, barrier: 0 };
  each(area => {
    counts.chunks++;
    counts.carcass += area.decor.remains.filter(r => ['deer', 'bear', 'fox', 'rabbit'].includes(r.kind)).length;
    counts.person += area.decor.remains.filter(r => r.kind.startsWith('person')).length;
    counts.vehicle += area.decor.vehicles.filter(v => ['sedan', 'pickup', 'van'].includes(v.kind)).length;
    counts.barrier += area.decor.logs.filter(l => l.barrier).length;
  }, 10);
  const rate = k => counts[k] / counts.chunks;
  assert.ok(rate('carcass') > .12 && rate('carcass') < .30, 'carcass ' + rate('carcass'));
  assert.ok(rate('person') > .02 && rate('person') < .08, 'person ' + rate('person'));
  assert.ok(rate('vehicle') > .02 && rate('vehicle') < .12, 'vehicle ' + rate('vehicle'));
  assert.ok(rate('barrier') > .03 && rate('barrier') < .20, 'barrier ' + rate('barrier'));
});

test('firefly pockets cover a minority of the world and snags are rare', () => {
  let inside = 0, total = 0;
  for (let x = -3000; x < 3000; x += 50) for (let z = -3000; z < 3000; z += 50) { total++; if (inFireflyPocket(1.7, x, z)) inside++; }
  assert.ok(inside / total > .04 && inside / total < .25, 'pocket coverage ' + inside / total);
  assert.ok(fireflyField(1.7, 0, 0) >= 0 && fireflyField(1.7, 0, 0) <= 1);
  let snags = 0, n = 5000;
  for (let i = 0; i < n; i++) if (isSnag('k' + (i >> 4), i, hash)) snags++;
  assert.ok(snags / n > .05 && snags / n < .11, 'snag rate ' + snags / n);
});
