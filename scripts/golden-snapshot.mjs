import { createWorld } from '../src/world.js';
import { writeFileSync } from 'node:fs';
export function snapshot() {
  const out = {};
  for (let s = 0; s < 12; s++) {
    const w = createWorld('golden-' + s);
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      const a = w.chunk(cx, cz);
      out[s + ':' + cx + ',' + cz] = JSON.stringify([
        a.trees.map(t => [t.x, t.z, t.r, t.height].map(v => +v.toFixed(3))),
        a.loot.map(l => [l.id, +l.x.toFixed(3), +l.z.toFixed(3), l.kind]),
        a.entrances.map(e => [+e.x.toFixed(3), +e.z.toFixed(3)]),
        a.buildings.map(b => [b.x, b.z, b.id]),
        a.plants.length, a.markers.length]);
    }
  }
  return out;
}
if (process.argv[1].endsWith('golden-snapshot.mjs')) writeFileSync('tests/fixtures/world-1.0.17.json', JSON.stringify(snapshot()));
