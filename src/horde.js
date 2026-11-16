import { angleDelta, clamp, direction, distance } from './world.js';
import { DIFFICULTIES } from './difficulty.js';

const PI = Math.PI;
const QUADRANT = PI / 2;
export const OPENING_SECONDS = DIFFICULTIES.standard.opening;
const eye = (world, p, y) => ({ x: p.x, y: world.height(p.x, p.z) + y, z: p.z });
const heading = (from, to) => Math.atan2(to.x - from.x, from.z - to.z);
const quadrant = (from, to) => (Math.round(heading(from, to) / QUADRANT) + 4) % 4;

export function hordeSectors(run, range = 42) {
  const counts = [0, 0, 0, 0];
  for (const enemy of run.enemies) {
    if (!enemy.dead && distance(run.player, enemy) <= range) counts[quadrant(run.player, enemy)]++;
  }
  return counts;
}

function hidden(world, head, p, spot, beamSettings) {
  const body = eye(world, spot, 1.18), top = eye(world, spot, 1.78);
  if (world.clear(head, body) || world.clear(head, top)) return false;
  if (!p.flashlight || !beamSettings) return true;
  const { origin, ray, range, angle } = beamSettings;
  for (const target of [body, top]) {
    const x = target.x - origin.x, y = target.y - origin.y, z = target.z - origin.z;
    const d = Math.hypot(x, y, z);
    if (d <= range && x*ray.x + y*ray.y + z*ray.z > Math.cos(angle) * d && world.clear(origin, target))
      return false;
  }
  return true;
}

function entrance(run, bearing, opening, beamSettings, sector) {
  const { player, world, rng } = run;
  const head = eye(world, player, player.eyeHeight);
  const min = opening ? 25 : 13;
  const max = opening ? 42 : 33;
  const valid = pos => {
    const d = distance(player, pos);
    return d >= min && d <= max && quadrant(player, pos) === sector &&
      !world.blocks(pos.x, pos.z, .49) &&
      run.enemies.every(e => e.dead || distance(e, pos) > 2.05) &&
      hidden(world, head, player, pos, beamSettings);
  };
  for (let i = 0; i < 30; i++) {
    const ray = direction(bearing + (rng() - .5) * 1.32);
    const d = min + (max - min) * (opening ? rng() : rng() ** 1.6);
    const pos = { x: player.x + ray.x*d, z: player.z + ray.z*d };
    if (valid(pos)) return pos;
  }
  const sites = world.around(player.x, player.z, max).flatMap(area => area.entrances)
    .filter(pos => quadrant(player, pos) === sector && distance(player, pos) <= max)
    .sort((a, b) => Math.abs(angleDelta(heading(player, a), bearing)) - Math.abs(angleDelta(heading(player, b), bearing)));
  return sites.find(valid) || null;
}

function waypoint(run, spot, intercept) {
  const { world, player } = run;
  const lead = intercept ? Math.min(16.5, Math.hypot(player.travelX, player.travelZ)*6.1) : 0;
  const travel = direction(run.travelBearing ?? player.yaw);
  const center = { x: player.x + travel.x * lead, z: player.z + travel.z * lead };
  const angle = heading(center, spot);
  for (const offset of [0, .40, -.40, .78, -.78]) {
    const d = direction(angle + offset);
    const r = intercept ? 1.15 : 4.0;
    const point = { x: center.x + d.x * r, z: center.z + d.z * r };
    if (!world.blocks(point.x, point.z, .58)) return point;
  }
  return center;
}

function spawn(run, sector, bearing, opening, beam, addEnemy, replace = null) {
  const point = entrance(run, bearing, opening, beam, sector);
  if (!point) return false;
  const roll = run.rng();
  const elapsed = run.time * DIFFICULTIES.standard.middle / run.rules.middle;
  const brute = clamp((elapsed - 47) / 570, 0, .23);
  const shrieker = clamp((elapsed - 23) / 400 + .05, .04, .26);
  const enemy = addEnemy(run, roll < brute ? 'brute' : roll < brute + shrieker ? 'shrieker' : 'shambler', point.x, point.z);
  if (replace) replace.dead = true;
  const moving = Math.hypot(run.player.travelX, run.player.travelZ) >= .82;
  const ahead = moving && quadrant(run.player, { x:run.player.x+run.player.travelX, z:run.player.z+run.player.travelZ }) === sector;
  enemy.approach = {
    ...waypoint(run, point, ahead && !opening),
    at: opening ? run.rules.opening + run.rng()*8 : run.time + .35 + run.rng()*1.85,
    until: opening ? run.rules.opening + 41 : run.time + 33,
  };
  enemy.spawn = { x: enemy.x, z: enemy.z, sector, time: run.time };
  run.metrics.spawns[sector]++;
  if (ahead) run.metrics.aheadSpawns++;
  return true;
}

export function seedHorde(run, cap, addEnemy) {
  for (let i = 0; i < cap; i++) {
    const sectors = hordeSectors(run);
    const order = [0, 1, 2, 3].sort((a,b) => sectors[a] - sectors[b]);
    if (!order.some(n => spawn(run, n, n * QUADRANT, true, null, addEnemy))) break;
  }
}

export function replenishHorde(run, cap, beam, addEnemy) {
  const { player, world, time } = run;
  const moving = Math.hypot(player.travelX, player.travelZ) >= .82;
  const opening = time < run.rules.opening;
  const head = eye(world, player, player.eyeHeight);
  run.travelBearing = moving ? Math.atan2(player.travelX, -player.travelZ) : null;
  const ahead = moving ? (Math.round(run.travelBearing / QUADRANT) + 4) % 4 : null;
  const sectors = hordeSectors(run, 32);
  const order = [0, 1, 2, 3];
  const shift = run.spawnTurn++ % 4;
  const weight = s => sectors[s] - (!opening && moving && s === ahead ? 1.8 : 0);
  order.sort((a,b) => weight(a) - weight(b) || (a + shift)%4 - (b + shift)%4);
  const live = run.enemies.filter(e => !e.dead).length;
  if (live >= cap) {
    if (opening || sectors[order[0]] >= Math.max(1, Math.floor(cap / 4))) return;
    const recycle = run.enemies.filter(e => !e.dead && !e.ambush && distance(e, player) > 29 &&
      quadrant(player, e) !== order[0] && e.windup <= 0 && hidden(world, head, player, e, beam))
      .sort((a,b) => distance(b, player) - distance(a, player))[0];
    if (!recycle) return;
    const sector = order[0];
    spawn(run, sector, sector === ahead ? run.travelBearing : sector * QUADRANT, false, beam, addEnemy, recycle);
    return;
  }
  for (const sector of order) {
    if (spawn(run, sector, sector === ahead && !opening ? run.travelBearing : sector * QUADRANT, opening, beam, addEnemy))
      return;
  }
}
