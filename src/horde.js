import { angleDelta, clamp, direction, distance } from './world.js';
import { DIFFICULTIES } from './difficulty.js';

const PI = Math.PI;
const QUADRANT = PI / 2;
const OCTANT = PI / 4;
export const OPENING_SECONDS = DIFFICULTIES.standard.opening;
const eye = (world, p, y) => ({ x: p.x, y: world.height(p.x, p.z) + y, z: p.z });
const heading = (from, to) => Math.atan2(to.x - from.x, from.z - to.z);
const quadrant = (from, to) => (Math.round(heading(from, to) / QUADRANT) + 4) % 4;
const octant = (from, to) => (Math.round(heading(from, to) / OCTANT) + 8) % 8;

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

function entrance(run, bearing, opening, beamSettings, sector, sectorOf) {
  const { player, world, rng } = run;
  const head = eye(world, player, player.eyeHeight);
  const min = opening ? 25 : 13;
  const max = opening ? 42 : 33;
  const valid = pos => {
    const d = distance(player, pos);
    return d >= min && d <= max && sectorOf(player, pos) === sector &&
      !world.blocks(pos.x, pos.z, .49) &&
      run.enemies.every(e => e.dead || distance(e, pos) > 2.05) &&
      hidden(world, head, player, pos, beamSettings);
  };
  for (let i = 0; i < 30; i++) {
    const ray = direction(bearing + (rng() - .5) * (sectorOf === octant ? .84 : 1.32));
    const d = min + (max - min) * (opening ? rng() : rng() ** 1.6);
    const pos = { x: player.x + ray.x*d, z: player.z + ray.z*d };
    if (valid(pos)) return pos;
  }
  const sites = world.around(player.x, player.z, max).flatMap(area => area.entrances)
    .filter(pos => sectorOf(player, pos) === sector && distance(player, pos) <= max)
    .sort((a, b) => Math.abs(angleDelta(heading(player, a), bearing)) - Math.abs(angleDelta(heading(player, b), bearing)));
  return sites.find(valid) || null;
}

function waypoint(run, spot, intercept) {
  const { world, player } = run;
  const lead = intercept ? clamp(Math.hypot(player.travelX, player.travelZ)*4.8, 6, 13) : 0;
  const travel = direction(run.travelBearing ?? player.yaw);
  const side = intercept ? clamp((spot.x-player.x)*travel.z-(spot.z-player.z)*travel.x,-3.3,3.3) : 0;
  const center = { x: player.x + travel.x * lead + travel.z*side*.68,
    z: player.z + travel.z * lead - travel.x*side*.68 };
  const angle = heading(center, spot);
  for (const offset of [0, .40, -.40, .78, -.78]) {
    const d = direction(angle + offset);
    const r = intercept ? 1.15 : 4.0;
    const point = { x: center.x + d.x * r, z: center.z + d.z * r };
    if (!world.blocks(point.x, point.z, .58)) return point;
  }
  return center;
}

function spawn(run, sector, bearing, opening, beam, addEnemy, replace = null, sectorOf = quadrant) {
  const point = entrance(run, bearing, opening, beam, sector, sectorOf);
  if (!point) return false;
  const roll = run.rng();
  const elapsed = run.time * DIFFICULTIES.standard.middle / run.rules.middle;
  const brute = clamp((elapsed - 47) / 570, 0, .23);
  const shrieker = clamp((elapsed - 23) / 400 + .05, .04, .26);
  const enemy = addEnemy(run, roll < brute ? 'brute' : roll < brute + shrieker ? 'shrieker' : 'shambler', point.x, point.z);
  if (replace) replace.dead = true;
  const moving = Math.hypot(run.player.travelX, run.player.travelZ) >= .82;
  const movement = Math.atan2(run.player.travelX, -run.player.travelZ);
  const offset = Math.abs(angleDelta(heading(run.player,point),movement));
  const ahead = moving && offset < QUADRANT*.56;
  const intercept = moving && !opening && offset < 1.25;
  enemy.approach = {
    ...waypoint(run, point, intercept),
    at: opening ? run.rules.opening + run.rng()*8 : run.time + (intercept ? .17 + run.rng()*.56 : .35 + run.rng()*1.1),
    until: opening ? run.rules.opening + 41 : run.time + (intercept ? 14 : 29),
    role: intercept ? 'cutoff' : 'arrival',
  };
  const cardinal = quadrant(run.player, point);
  enemy.spawn = { x: enemy.x, z: enemy.z, sector:cardinal, time: run.time };
  run.metrics.spawns[cardinal]++;
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
  const live = run.enemies.filter(e => !e.dead).length;
  if (opening) {
    const shift = run.spawnTurn++ % 4;
    if (live >= cap) return;
    const sectors = hordeSectors(run, 32);
    const order = [0,1,2,3].sort((a,b)=>sectors[a]-sectors[b] || (a+shift)%4-(b+shift)%4);
    order.some(sector=>spawn(run,sector,sector*QUADRANT,true,beam,addEnemy));
    return;
  }
  const atCap = live >= cap;
  const fullness = Array(8).fill(0);
  const pressure = Array(8).fill(0);
  const border = run.time > run.rules.middle ? 35 : 32;
  for (const enemy of run.enemies) {
    if (enemy.dead) continue;
    const gap = distance(player,enemy);
    if (gap > border) continue;
    const angle = octant(player,enemy);
    const mass = clamp((border+8-gap)/21,.35,1) * (enemy.ambush?.stage === 'holding' ? .65 : 1);
    pressure[angle] += mass;
    fullness[angle]++;
  }
  const nearSectors = fullness.filter(count=>count>0).length;
  run.metrics.directionalSamples++;
  run.metrics.coveredSectors += nearSectors;
  const shift = run.spawnTurn++ % 8;
  const weight = sector => {
    const offset = moving ? Math.abs(angleDelta(sector*OCTANT,run.travelBearing)) : Infinity;
    const route = offset < .51 ? 1.55 : offset < 1.32 ? .72 : 0;
    return pressure[sector]+.20*(pressure[(sector+7)%8]+pressure[(sector+1)%8])-route;
  };
  const order = Array.from({length:8},(_,i)=>i).sort((a,b)=>weight(a)-weight(b) || (a+shift)%8-(b+shift)%8);
  const recycle = atCap ? run.enemies.filter(enemy => {
    if (enemy.dead || enemy.ambush || enemy.attackAge!==undefined) return false;
    const gap = distance(enemy,player);
    return gap > 25 && (gap > border || fullness[octant(player,enemy)] >= 2) &&
      hidden(world,head,player,enemy,beam);
  }).sort((a,b)=>distance(b,player)-distance(a,player)) : [];
  if (atCap && !recycle.length) return;
  for (const sector of order.slice(0,4)) {
    if (atCap && fullness[sector] >= Math.max(1,Math.floor(cap/8))) continue;
    const replacement = atCap ? recycle.find(e=>octant(player,e)!==sector) : null;
    if (atCap && !replacement) continue;
    const ahead = moving && Math.abs(angleDelta(sector*OCTANT,run.travelBearing)) < OCTANT*.5;
    const bearing = ahead ? run.travelBearing : sector*OCTANT;
    if (spawn(run,sector,bearing,false,beam,addEnemy,replacement,octant)) return;
  }
}
