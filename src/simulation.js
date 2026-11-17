import { angleDelta, clamp, createWorld, direction, distance, random, START } from './world.js';
import { animatedAnchors, attackContact, attackDirection, burstPhase, BURST_BRAKE, BURST_LOAD, BURST_RUN,
  enemyMotion, HIT_SEGMENTS, hitRadii, strideLength, updateEnemyFooting } from './enemy-motion.js';
import { replenishHorde, seedHorde } from './horde.js';
import { activeHordeLimit, ARSENAL_WAVES, DIFFICULTIES, difficultyKey, pressureTime } from './difficulty.js';
import { ambushDecision, reserveAmbush } from './ambush.js';
import { reachableRadio, visitBuildings } from './extraction.js';

export const STEP = 1 / 30;
export const BUILD = '1.0.17';
export { hordeTarget } from './difficulty.js';
export const GUNS = {
  pistol: { name: 'Service pistol', capacities: [6, 12, 24, 50], reload: 1.5, interval: .31, range: 65, damage: 1.24, noise: 44, rounds: 1, spread: 0 },
  shotgun: { name: 'Pump shotgun', capacities: [4, 5, 6, 7], reload: 2.2, interval: .83, range: 34, damage: .91, noise: 57, rounds: 7, spread: .077 },
  smg: { name: 'Compact SMG', capacities: [24, 28, 32, 36], reload: 1.8, interval: .102, range: 49, damage: .93, noise: 48, rounds: 1, spread: .02 },
  carbine: { name: 'Ranger carbine', capacities: [16, 20, 24, 28], reload: 2, interval: .24, range: 75, damage: 1.49, noise: 53, rounds: 1, spread: 0 },
  flaregun: { name: 'Flare gun', capacities: [1, 1, 1, 1], reload: 1.35, interval: .42 },
};
export const ENEMIES = {
  shambler: { speed: .84, height: 1.77, width: .28, hp: 3.2, windup: .60, reach: 1.19 },
  shrieker: { speed: 1.36, height: 1.66, width: .23, hp: 2.4, windup: .38, reach: 1.16 },
  brute: { speed: .72, height: 2, width: .36, hp: 5.9, windup: .83, reach: 1.35 },
};
export const UPGRADES = {
  damage: { name: 'Hot loads', icon: '▲', cap: 3, color: '#ff8b70', description: '+15% damage' },
  pierce: { name: 'Piercing rounds', icon: '»', cap: 2, color: '#ffb36c', description: '+1 target per shot' },
  reload: { name: 'Speed loader', icon: '↻', cap: 3, color: '#f1cd86', description: '15% faster reload' },
  battery: { name: 'Battery cells', icon: 'ϟ', cap: 3, color: '#a6d6a0', description: '+8 seconds of light' },
  lens: { name: 'Focus lens', icon: '◇', cap: 3, color: '#9adae6', description: '+3 metres of light' },
  capacity: { name: 'Extended Capacity', icon: '▤', cap: 3, color: '#e2d18d' },
};
export const LOOT = {
  ...UPGRADES,
  ammo: { name: 'Spare rounds', icon: '⋮', color: '#bac5b8' },
  flareAmmo: { name: 'Spare flares', icon: '⁝', color: '#ff9664' },
  pistol: { name: 'Service pistol', icon: 'pistol', color: '#f0cc91' },
  shotgun: { name: 'Pump shotgun', icon: 'shotgun', color: '#ffd299' },
  smg: { name: 'Compact SMG', icon: 'smg', color: '#ebbc91' },
  carbine: { name: 'Ranger carbine', icon: 'carbine', color: '#e5ce98' },
  armor1: { name: 'Padded vest', icon: 'Ⅰ', color: '#9cb9ce' },
  armor2: { name: 'Protective vest', icon: 'Ⅱ', color: '#abc5e0' },
  armor3: { name: 'Heavy plates', icon: 'Ⅲ', color: '#bbd6ec' },
};
const POINT = { x: 0, y: 0, z: -1 };
const ARMS = .29;
const RESERVE_MAX = 125;
const FLARE_RESERVE_MAX = 49;
const FLARE_BURN = 10;
const FLARE_FLIGHT = 2.5;
const FLARE_SPEED = 23;
const FLARE_GRAVITY = 18;
const MAX_LOOSE_LOOT = 72;
const LEGENDARY_CAPACITY = GUNS.pistol.capacities.at(-1);
const beamCycle = { wide: 'focus', focus: 'off', off: 'wide' };
const eye = (world, next, tall = 1.4) => ({ x: next.x, y: world.height(next.x, next.z) + tall, z: next.z });

export function magazineCapacity(player) {
  return player.offhand ? LEGENDARY_CAPACITY : GUNS[player.weapon].capacities[player.upgrades.capacity];
}

export function flarePower(age) {
  if (age <= 5) return 1;
  const fade = clamp((25 - age) / 20, 0, 1);
  return fade * fade * (3 - 2 * fade);
}

export function isSupply(kind) {
  return kind === 'ammo' || kind === 'flareAmmo';
}

export function signalFlarePower(age) {
  const fade = clamp((FLARE_BURN - age) / (FLARE_BURN - 1.5), 0, 1);
  return fade * fade * (3 - 2 * fade);
}

function isFlareTarget(reason) {
  return reason === 'loot flare' || reason === 'signal flare';
}

export function beamSettings(player, mode = player.beam) {
  const focus = mode === 'focus';
  return { range: (focus ? 23 : 15) + player.upgrades.lens * 3, angle: focus ? .235 : .49 };
}

export function activeBeams(run) {
  return run.player.flashlight ? [run.beam, run.offhandBeam].filter(Boolean) : [];
}

export function resolvedBeam(world, lamp, head) {
  if (!lamp || !head) return lamp;
  const delta = { x: lamp.origin.x - head.x, y: lamp.origin.y - head.y, z: lamp.origin.z - head.z };
  const range = Math.hypot(delta.x, delta.y, delta.z);
  if (range <= .01) return lamp;
  const ray = norm(delta), hit = world.raycast(head, ray, range, false);
  if (!hit) return lamp;
  return hit.t > .12 ? { ...lamp, origin: rayPoint(head, ray, hit.t - .12) } : null;
}

export function resolvePlayerBeam(run, lamp, head, offhand = false) {
  const p = run.player, mode = offhand ? p.offhand?.beam : p.beam;
  if (!mode || mode === 'off') return null;
  const cast = resolvedBeam(run.world, lamp, head);
  return cast ? { ...cast, ...beamSettings(p, mode), mode } : null;
}

function norm(v) {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 0 ? { x: v.x / length, y: v.y / length, z: v.z / length } : POINT;
}

function inBeam(world, beam, at) {
  const dx = at.x - beam.origin.x, dy = at.y - beam.origin.y, dz = at.z - beam.origin.z;
  const d = Math.hypot(dx, dy, dz);
  return d < beam.range && dx * beam.ray.x + dy * beam.ray.y + dz * beam.ray.z >= Math.cos(beam.angle) * d
    && world.clear(beam.origin, at);
}

export function enemyPose(enemy) {
  const [chin, brow, chest, hips] = animatedAnchors(enemy, ENEMIES[enemy.kind].windup, 4);
  const center = (a,b) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:(a.z+b.z)/2 });
  return { head:center(chin,brow), torso:center(chest,hips) };
}

function raySphere(origin, ray, center, radius) {
  const x = center.x - origin.x, y = center.y - origin.y, z = center.z - origin.z;
  const projection = x * ray.x + y * ray.y + z * ray.z;
  const c = x*x + y*y + z*z - radius*radius;
  if (c <= 0) return 0;
  const h = projection*projection - c;
  return h >= 0 && projection >= 0 ? Math.max(0, projection - Math.sqrt(h)) : Infinity;
}

function rayCapsule(origin, ray, first, last, radius) {
  const dx = last.x-first.x, dy = last.y-first.y, dz = last.z-first.z;
  const x = origin.x-first.x, y = origin.y-first.y, z = origin.z-first.z;
  const length2 = dx*dx+dy*dy+dz*dz;
  const projection = dx*ray.x+dy*ray.y+dz*ray.z;
  const from = dx*x+dy*y+dz*z;
  const originRay = x*ray.x+y*ray.y+z*ray.z;
  const a = length2-projection*projection;
  const b = length2*originRay-from*projection;
  const c = length2*(x*x+y*y+z*z-radius*radius)-from*from;
  if (c <= 0 && from >= 0 && from <= length2) return 0;
  const d = b*b-a*c;
  if (a > 1e-8 && d >= 0) {
    const t = (-b-Math.sqrt(d))/a, across = from+t*projection;
    if (t >= 0 && across >= 0 && across <= length2) return t;
  }
  return Math.min(raySphere(origin, ray, first, radius), raySphere(origin, ray, last, radius));
}

const rayPoint = (origin, ray, t) => ({
  x: origin.x + ray.x*t, y: origin.y + ray.y*t, z: origin.z + ray.z*t,
});

function muzzleCover(world, aim) {
  if (!aim.viewOrigin) return null;
  const head = aim.viewOrigin, o = aim.origin;
  const dx = o.x-head.x, dy = o.y-head.y, dz = o.z-head.z;
  const range = Math.hypot(dx,dy,dz);
  if (range <= .01) return null;
  const ray = { x:dx/range, y:dy/range, z:dz/range };
  const hit = world.raycast(head, ray, range);
  return hit && hit.t <= range ? { zone:'cover', surface:hit.kind, point:rayPoint(head,ray,hit.t), ray } : null;
}

function prepareTargets(run, origin, ray, range, spread = 0) {
  const targets = [];
  const horizontal = Math.hypot(ray.x, ray.z);
  for (const e of run.enemies) {
    if (e.dead) continue;
    const x = e.x-origin.x, z = e.z-origin.z, gap = Math.hypot(x,z);
    if (gap > range+1.2) continue;
    if (horizontal > .01 && (x*ray.x+z*ray.z < -horizontal || Math.abs(x*ray.z-z*ray.x) / horizontal > .98 + gap*spread*1.8)) continue;
    targets.push({ e, points:animatedAnchors(e, ENEMIES[e.kind].windup), radii:hitRadii(e.kind) });
  }
  return targets;
}

function traceRay(world, origin, ray, range, targets) {
  const solid = world.raycast(origin, ray, range);
  const limit = solid?.t ?? range;
  const hits = [];
  for (const { e, points, radii } of targets) {
    let best = limit, zone = null;
    for (const [i, [a,b,tag]] of HIT_SEGMENTS.entries()) {
      const radius = tag === 'head' ? radii[i] * 1.21 + .007 : radii[i];
      const t = rayCapsule(origin, ray, points[a], points[b], radius);
      if (t < best) { best = t; zone = tag; }
    }
    if (zone) hits.push({ e, t:best, zone, point:rayPoint(origin,ray,best) });
  }
  hits.sort((a,b) => a.t-b.t);
  return { hits, cover: solid && { zone:'cover', surface:solid.kind, point:rayPoint(origin,ray,solid.t) } };
}

export function traceAim(run, aim) {
  if (!aim?.origin || !aim?.ray) return null;
  const blocked = muzzleCover(run.world, aim);
  if (run.player.weapon === 'flaregun') {
    const flare = createSignalFlare(aim, blocked);
    while (flare.age < FLARE_FLIGHT && !flare.landed) advanceFlare(run.world, flare, .12);
    return flare.landed ? { zone: 'cover', point: flare } : null;
  }
  if (blocked) return blocked;
  const { range } = GUNS[run.player.weapon], ray = norm(aim.ray);
  const { hits, cover } = traceRay(run.world, aim.origin, ray, range, prepareTargets(run, aim.origin, ray, range));
  return hits[0] || cover;
}

function emit(run, type, data = {}) {
  run.events.push({ type, ...data });
}

export function createRun(seed, { crowdLimit = 48, populate = true, difficulty = 'standard', legendary = false, arsenal = null } = {}) {
  difficulty = difficultyKey(difficulty);
  if (arsenal) {
    legendary = false;
    arsenal = { weapon: Object.hasOwn(GUNS, arsenal.weapon) ? arsenal.weapon : 'pistol',
      wave: ARSENAL_WAVES.includes(arsenal.wave) ? arsenal.wave : 0 };
  }
  const upgrades = Object.fromEntries(Object.entries(UPGRADES).map(([key, upgrade]) => [key, arsenal ? upgrade.cap : 0]));
  const magazines = arsenal
    ? Object.fromEntries(Object.entries(GUNS).map(([weapon, gun]) => [weapon, gun.capacities[upgrades.capacity]]))
    : legendary ? { pistol: LEGENDARY_CAPACITY } : { pistol: GUNS.pistol.capacities[0], flaregun: 1 };
  const world = createWorld(seed);
  const run = {
    seed, world, rng: random(seed + ':run'), time: 0, status: 'playing', crowdLimit, legendary, arsenal,
    difficulty, rules: DIFFICULTIES[difficulty], crowdRoll: random(seed + ':crowd')(),
    player: { ...START, y: world.height(START.x, START.z), eyeHeight: 1.63, yaw: 0,
      weapon: arsenal?.weapon ?? 'pistol', magazines,
      offhand: legendary ? { ammo: LEGENDARY_CAPACITY, reload: null, cooldown: 0, beam: 'wide' } : null,
      get ammo() { return this.magazines[this.weapon]; },
      set ammo(rounds) { this.magazines[this.weapon] = rounds; },
      get equippedReserve() { return this.weapon === 'flaregun' ? this.flares : this.reserve; },
      flares: arsenal ? FLARE_RESERVE_MAX : legendary ? 0 : 19,
      reserve: arsenal ? RESERVE_MAX : 50, armor: 0, protection: 0, reload: null, cooldown: 0,
      flashlight: true, battery: 1, beam: 'wide', upgrades,
      travelX: 0, travelZ: 0, stepDistance: 0, kills: 0, headshots: 0, noisePeak: 0 },
    enemies: [], loot: [], signalFlares: [], settledLoot: new Set(), events: [], noises: [], corpses: [],
    search: { visits: new Map(), sheds: 0, radio: null },
    nextId: 1, nextSpawn: 2, nextRecycle: 0, spawnTurn: 0, nextLoot: 33, lastChunkCheck: -Infinity, lastBuildingCheck: -Infinity, dryKills: 0,
    nextAttack: 0, nextSwarmTick: 0, death: null, populate, notice: '',
    metrics: { shots: 0, dryFire: 0, roundsPicked: 0, upgrades: 0, guarded: 0, lootFlareSeconds: 0,
      pressureSeconds: 0, damage: {}, pickups: {}, maxCrowd: 0, peakPursuit: 0, peakDiversion: 0,
      spawns: [0,0,0,0], aheadSpawns: 0, directionalSamples:0, coveredSectors:0 },
  };
  updateLandmarks(run);
  // A separate starting offset keeps the layout and ordinary opening spawns seed-stable.
  const [firstAmbush, lastAmbush] = run.rules.ambush;
  run.ambushRng = random(seed+':ambush');
  run.nextAmbush = Math.max(0, run.rules.opening - pressureTime(run)) + firstAmbush+run.ambushRng()*(lastAmbush-firstAmbush);
  run.metrics.ambushes = {reserved:0,emerged:0,hits:0};
  if (populate) seedHorde(run, activeHordeLimit(run), addEnemy);
  run.events.length = 0;
  return run;
}

export function addEnemy(run, kind, x, z) {
  const index = run.nextId++, p = run.player, cfg = ENEMIES[kind];
  const enemy = { id: index, kind, x, y: run.world.height(x, z), z,
    yaw: Math.atan2(p.x - x, x === p.x && z === p.z ? -1 : z - p.z),
    hp: cfg.hp, pace: .74 + run.rng() * .46, gait: run.rng() * Math.PI * 2,
    nextThink: run.time + run.rng() * .36, voiceVariation: run.rng(), nextVoice: run.time,
    voiceBand: 2, lastVoice: -Infinity,
    target: null, reason: 'roaming', memory: null, swapAfter: 0,
    flank: index % 5 < 2 ? (index % 2 ? -1 : 1) : 0,
    roam: run.rng() * Math.PI * 2, nextRoam: run.time + 3, windup: 0, recover: 0,
    slow: 0, stun: 0, burst: 0, nextBurst: run.time + 1, turnSide: index % 2 ? 1 : -1, stuck: 0, stride: 0,
    stumble: 0, stumbleDuration: 0, nextStumble: run.time + 2 + index % 7,
    moveSpeed: 0, poseTime: run.time, hitAge: Infinity, startAge: Infinity, turnRate: 0,
  };
  enemy.appearance = enemy.voiceVariation < .5 ? kind : kind + '-alt';
  enemy.previousTransform = { x, y: enemy.y, z, yaw: enemy.yaw };
  run.enemies.push(enemy);
  return enemy;
}

export function setLoot(run, kind, x, z, id = 'drop:' + run.nextId++, amount = 0) {
  if (run.legendary && kind !== 'ammo' && !kind.startsWith('armor')) return null;
  if (run.settledLoot.has(id)) return null;
  const y = run.world.height(x, z);
  const loot = { id, kind, x, z, y, born: run.time, amount, landmark: !id.startsWith('drop:') };
  run.loot.push(loot);
  if (!isSupply(kind)) emit(run, 'flare', { x, y: y + .4, z, kind });
  return loot;
}

function updateLandmarks(run) {
  const known = new Set(run.loot.map(l => l.id));
  const { player: p, world } = run;
  for (const area of world.around(p.x, p.z, 60)) {
    for (const site of area.loot) {
      if (run.time >= site.unlock && distance(p, site) < 35 && !known.has(site.id))
        setLoot(run, site.kind, site.x, site.z, site.id, site.kind === 'ammo' ? 16 : 0);
      if (run.legendary || site.kind !== 'ammo' || run.time < site.unlock || distance(p, site) >= 35) continue;
      const id = site.id + ':flares';
      if (!known.has(id) && !run.settledLoot.has(id) && random(run.seed + ':' + id)() < .36)
        setLoot(run, 'flareAmmo', site.x, site.z, id, 4);
    }
  }
  run.loot = run.loot.filter(item => !item.lost);
  // Keep the activation age of distant landmarks without treating them as live signals.
  const loose = run.loot.filter(item => !item.landmark && !item.lost);
  if (loose.length > MAX_LOOSE_LOOT)
    for (const item of loose.slice(0, loose.length - MAX_LOOSE_LOOT)) item.lost = true;
}

function majorDrop(run) {
  const { player: p, world } = run;
  const options = run.legendary ? ['ammo'] : Object.keys(UPGRADES).filter(k => p.upgrades[k] < UPGRADES[k].cap);
  options.push(run.time < 130 ? 'armor1' : run.time < 255 ? 'armor2' : 'armor3');
  if (!run.legendary && run.time > 54) {
    const next = ['shotgun', 'smg'].find(weapon => !Object.hasOwn(p.magazines, weapon));
    if (next) options.push(next);
  }
  if (!run.legendary && run.time >= 90 && !Object.hasOwn(p.magazines, 'carbine')) options.push('carbine');
  const kind = options[Math.floor(run.rng() * options.length)];
  const ahead = p.yaw + (run.rng() - .5) * 1.4;
  for (let i = 0; i < 11; i++) {
    const v = direction(ahead + (i % 2 ? 1 : -1) * i * .16), d = 9 + run.rng() * 7;
    const x = p.x + d * v.x, z = p.z + d * v.z;
    if (world.blocks(x, z, .7)) continue;
    setLoot(run, kind, x, z);
    return;
  }
}

function noise(run, kind, origin, radius, span) {
  run.noises.push({ kind, origin: { ...origin }, radius, born: run.time, span });
  if (run.noises.length > 34) run.noises.shift();
}

function eliminate(run, e, headshot) {
  const p = run.player;
  e.dead = true;
  p.kills++;
  if (headshot) p.headshots++;
  run.corpses.push({ ...e, headshot, diedAt: run.time, fallAge: 0,
    fallFrom: enemyMotion(e, ENEMIES[e.kind].windup) });
  if (run.corpses.length > 21) run.corpses.shift();
  emit(run, 'kill', { ...enemyPose(e).torso, kind: e.kind, headshot });
  run.dryKills++;
  if (run.rng() < .37 || run.dryKills >= 3) {
    setLoot(run, 'ammo', e.x, e.z, undefined, e.kind === 'brute' ? 12 : 5 + Math.floor(run.rng() * 3));
    run.dryKills = 0;
  } else if (run.rng() < .09 || (e.kind === 'brute' && run.rng() < .25)) {
    const eligible = run.legendary ? [] : Object.keys(UPGRADES).filter(k => p.upgrades[k] < UPGRADES[k].cap);
    eligible.push(run.time < 110 ? 'armor1' : run.time < 260 ? 'armor2' : 'armor3');
    setLoot(run, eligible[Math.floor(run.rng() * eligible.length)], e.x, e.z);
  }
  if (!run.legendary && p.kills % 8 === 0) setLoot(run, 'flareAmmo', e.x, e.z, undefined, 3);
}

function createSignalFlare(aim, blocked) {
  const ray = norm(aim.ray);
  const point = blocked ? rayPoint(blocked.point, blocked.ray, -.045) : aim.origin;
  return { ...point, age: 0, landed: false, vx: blocked ? 0 : ray.x * FLARE_SPEED,
    vy: blocked ? 0 : ray.y * FLARE_SPEED, vz: blocked ? 0 : ray.z * FLARE_SPEED };
}

function advanceFlare(world, flare, dt) {
  const remaining = Math.min(dt, FLARE_FLIGHT - flare.age);
  const dx = flare.vx * remaining, dz = flare.vz * remaining;
  const dy = (flare.vy - .5 * FLARE_GRAVITY * remaining) * remaining;
  const length = Math.hypot(dx, dy, dz);
  const ray = length ? { x: dx / length, y: dy / length, z: dz / length } : POINT;
  const hit = length ? world.raycast(flare, ray, length) : null;
  flare.age += remaining;
  flare.vy -= FLARE_GRAVITY * remaining;
  const point = rayPoint(flare, ray, hit ? Math.max(0, hit.t - .04) : length);
  if (hit || flare.age >= FLARE_FLIGHT) {
    flare.landed = true;
    const ground = world.height(point.x, point.z);
    const below = hit?.kind !== 'earth' && point.y > ground + .13
      ? world.raycast(point, { x: 0, y: -1, z: 0 }, point.y - ground)
      : null;
    point.y = (below && below.kind !== 'earth' ? point.y - below.t : ground) + .13;
  }
  Object.assign(flare, point);
}

function updateSignalFlares(run, dt) {
  run.signalFlares = run.signalFlares.filter(flare => run.time - flare.born < FLARE_BURN);
  for (const flare of run.signalFlares) {
    if (flare.landed) continue;
    advanceFlare(run.world, flare, dt);
    if (!flare.landed) continue;
    flare.born = run.time;
    run.nextSwarmTick = Math.min(run.nextSwarmTick, run.time);
    emit(run, 'signalFlare', { x: flare.x, y: flare.y, z: flare.z });
  }
}

export function shoot(run, aim, offhand = false) {
  const { player: p, world } = run, gun = GUNS[p.weapon];
  const state = offhand ? p.offhand : p;
  if (!state || run.status !== 'playing' || state.cooldown > 0 || state.reload) return;
  if (!state.ammo) {
    if (startReload(run, offhand)) return;
    run.metrics.dryFire++;
    state.cooldown = .32;
    emit(run, 'dry', { reason: p.weapon === 'flaregun' ? 'No spare flares' : 'No spare rounds' });
    return;
  }
  const o = aim.origin, center = norm(aim.ray);
  const blocked = muzzleCover(world, aim);
  state.ammo--;
  state.cooldown = gun.interval;
  const flashOrigin = blocked ? rayPoint(blocked.point, blocked.ray, -.045) : o;
  if (p.weapon === 'flaregun') {
    run.signalFlares.push({ ...createSignalFlare(aim, blocked), id: 'signal:' + run.nextId++, born: run.time });
    noise(run, 'flare launch', flashOrigin, 8, .8);
    emit(run, 'shot', { ...flashOrigin, ray: center, weapon: p.weapon, blocked: Boolean(blocked), offhand });
    startReload(run);
    return;
  }
  p.noisePeak = run.time + .28;
  run.metrics.shots++;
  noise(run, 'gunshot', flashOrigin, gun.noise, 2.8);
  emit(run, 'shot', { ...flashOrigin, ray: center, weapon: p.weapon, blocked: Boolean(blocked), offhand });
  if (!state.ammo) startReload(run, offhand);
  if (blocked) {
    emit(run, 'impact', { ...blocked.point, surface: blocked.surface });
    return;
  }
  const possible = prepareTargets(run, o, center, gun.range, gun.spread);
  const hits = new Map();
  for (let shot = 0; shot < gun.rounds; shot++) {
    const spread = p.weapon === 'shotgun' && shot === 0 ? 0 : gun.spread;
    const ray = spread === 0 ? center : norm({ x: center.x + (run.rng() - .5) * spread * 2,
      y: center.y + (run.rng() - .5) * spread * 2, z: center.z + (run.rng() - .5) * spread * 2 });
    const { hits:candidates, cover } = traceRay(world, o, ray, gun.range, possible);
    const penetrates = 1 + (p.weapon === 'shotgun' && shot !== 0 ? 0 : p.upgrades.pierce);
    for (let i = 0; i < Math.min(penetrates, candidates.length); i++) {
      const hit = candidates[i];
      const current = hits.get(hit.e) || { total: 0, head: false, leg: false, point: hit.point };
      const headshot = hit.zone === 'head';
      current.total += gun.damage * (1 + p.upgrades.damage * .15) * .57 ** i *
        (headshot ? (hit.e.kind === 'brute' ? 2.2 : 2.8) : hit.zone === 'leg' || hit.zone === 'arm' ? .68 : 1);
      current.head ||= headshot;
      current.leg ||= hit.zone === 'leg';
      hits.set(hit.e, current);
    }
    if (cover && shot === 0 && candidates.length < penetrates)
      emit(run, 'impact', { ...cover.point, surface: cover.surface });
  }
  for (const [enemy, hit] of hits) {
    const brute = enemy.kind === 'brute';
    enemy.hp -= brute ? Math.min(hit.total, ENEMIES.brute.hp * .55) : hit.total;
    enemy.stun = hit.total > 1.1 ? .15 : .07;
    enemy.hitFrom = attackDirection(enemy, center);
    enemy.hitAge = 0;
    if (enemy.attackAge !== undefined && enemy.windup > 0 && (hit.head || hit.total > 1.1)) {
      enemy.attackAge = undefined;
      enemy.windup = 0;
      enemy.recover = .40;
    }
    if (hit.leg) enemy.slow = 1.3;
    emit(run, 'impact', { ...hit.point, surface: 'body' });
    if ((hit.head && !brute) || enemy.hp <= 0) eliminate(run, enemy, hit.head);
  }
}

export function startReload(run, offhand = false) {
  const p = run.player, gun = GUNS[p.weapon];
  const state = offhand ? p.offhand : p;
  if (!state || state.reload || !p.equippedReserve || state.ammo >= magazineCapacity(p) || run.status !== 'playing') return false;
  const duration = gun.reload * .85 ** p.upgrades.reload;
  state.reload = { duration, left: duration, weapon: p.weapon };
  emit(run, 'reload', { weapon: p.weapon, offhand });
  return true;
}

function takeLoot(run, confirm) {
  const p = run.player;
  const nearby = run.loot.filter(l => !l.lost && Math.abs(l.x - p.x) < 1.5 && distance(l, p) < 1.19)
    .sort((a, b) => distance(a, p) - distance(b, p));
  run.offer = null;
  for (const l of nearby) {
    const k = l.kind;
    if (Object.hasOwn(p.magazines, k) || (k.startsWith('armor') && Number(k.at(-1)) <= p.armor)) continue;
    if (!run.world.clear(eye(run.world, p, .6), { ...l, y: l.y + .44 })) continue;
    if (k in GUNS || k.startsWith('armor')) {
      run.offer ??= l;
      continue;
    }
    if (k === 'ammo') {
      const got = Math.max(0, Math.min(RESERVE_MAX - p.reserve, l.amount || 7));
      if (!got) continue;
      p.reserve += got;
      run.metrics.roundsPicked += got;
      take(run, l, '+' + got + ' rounds');
    } else if (k === 'flareAmmo') {
      const got = Math.max(0, Math.min(FLARE_RESERVE_MAX - p.flares, l.amount || 3));
      if (!got) continue;
      p.flares += got;
      take(run, l, '+' + got + ' flares');
    } else if (k in UPGRADES && p.upgrades[k] < UPGRADES[k].cap) {
      p.upgrades[k]++;
      run.metrics.upgrades++;
      const effect = k === 'capacity'
        ? p.weapon === 'flaregun' ? 'Firearm magazines expanded'
          : magazineCapacity(p) + (p.weapon === 'shotgun' ? ' shells' : ' rounds')
        : UPGRADES[k].description;
      take(run, l, LOOT[k].name + ' · ' + effect);
    }
  }
  const item = run.offer;
  if (!confirm || !item) return;
  if (item.kind in GUNS) {
    p.magazines[item.kind] = 0;
    equipWeapon(p, item.kind);
  } else p.armor = Number(item.kind.at(-1));
  take(run, item, LOOT[item.kind].name);
  run.offer = null;
}

function equipWeapon(player, weapon) {
  player.weapon = weapon;
  player.reload = null;
  player.cooldown = Math.max(player.cooldown, .25);
}

function cycleWeapon(run) {
  const p = run.player, weapons = Object.keys(p.magazines);
  if (weapons.length < 2) return;
  const next = weapons[(weapons.indexOf(p.weapon) + 1) % weapons.length];
  equipWeapon(p, next);
  emit(run, 'weaponSwitch', { weapon: next });
}

function take(run, loot, message) {
  loot.lost = true;
  if (loot.landmark) run.settledLoot.add(loot.id);
  run.metrics.pickups[loot.kind] = (run.metrics.pickups[loot.kind] || 0) + 1;
  emit(run, 'pickup', { kind: loot.kind, message });
}

function flareAssignments(run) {
  const { world, player: p } = run;
  const next = new Map();
  const lootBudget = Math.max(1, Math.round(run.enemies.length * .27));
  const signalBudget = Math.max(1, Math.round(run.enemies.length * .52));
  const signals = run.signalFlares.filter(flare => flare.landed).sort((a, b) => b.born - a.born);
  const loot = run.loot.filter(item => !item.lost && !isSupply(item.kind) && run.time - item.born < 25);
  loot.sort((a, b) => b.born - a.born || distance(a, p) - distance(b, p));
  for (const item of [...signals, ...loot]) {
    const signal = item.landed === true;
    const budget = signal ? signalBudget : lootBudget;
    if (next.size >= budget) break;
    if (distance(item, p) > (signal ? 66 : 47)) continue;
    const age = run.time - item.born;
    const power = signal ? signalFlarePower(age) : flarePower(age);
    if (power < .04) continue;
    const range = (signal ? 25 : 17) * Math.sqrt(power);
    const nearby = run.enemies.filter(e => !e.dead && distance(e, item) < range && distance(p, e) > 3.1);
    const lit = { ...item, y: item.y + (signal ? .10 : .48) };
    const interested = (signal ? .58 : .25) * Math.sqrt(power);
    const limit = Math.min(signal ? 7 : 3, budget - next.size, Math.round(nearby.length * interested));
    if (!limit) continue;
    const choices = nearby.filter(e => !next.has(e.id) && world.clear(eye(world, e), lit))
      .sort((a, b) => distance(a, item) - distance(b, item) + (a.target?.id === item.id ? -2.2 : 0)
        + (b.target?.id === item.id ? 2.2 : 0));
    for (const e of choices.slice(0, limit)) next.set(e.id, { ...item, power, range,
      reason: signal ? 'signal flare' : 'loot flare' });
  }
  run.guards = next;
}

function perception(run, e, gap, lamps) {
  const { world, player: p, time } = run, origin = eye(world, e, ENEMIES[e.kind].height * .87);
  const player = eye(world, p, p.eyeHeight * .8);
  const get = (x, z, score, reason, id, chase) => ({ x, z, score, reason, id, chase });
  let best = null;
  const offer = candidate => { if (!best || candidate.score > best.score) best = candidate; };
  if (gap < 5.1 && world.clear(origin, player))
    offer(get(p.x, p.z, gap < 3.1 ? 4 : 1.15, 'saw player', 'player', true));
  if (lamps.length) {
    const litGround = { ...origin, y: e.y + .28 };
    for (const light of lamps) {
      if (gap >= light.range + 5) continue;
      const { origin: lamp, ray } = light;
      if (inBeam(world, light, origin) ||
        inBeam(world, light, litGround) ||
        (gap < 7 && world.clear(origin, rayPoint(lamp, ray, .4)))) {
        offer(get(lamp.x, lamp.z, 1.08 - gap / (light.range + 10) * .57, 'flashlight', 'lamp', true));
      }
    }
  }
  for (let i = run.noises.length - 1; i >= 0; i--) {
    const n = run.noises[i], age = time - n.born, d = distance(origin, n.origin);
    if (age > n.span || d >= n.radius) continue;
    const occluded = !world.clear(origin, n.origin, false);
    const radius = n.radius * (occluded ? n.kind === 'gunshot' ? .7 : .54 : 1);
    const score = (1 - d / radius) * (1 - age / n.span) * (n.kind === 'gunshot' ? 1.24 : .92);
    if (score > .10) offer(get(n.origin.x, n.origin.z, score, n.kind, n.kind, true));
  }
  const guard = run.guards?.get(e.id);
  if (guard) {
    const strength = guard.reason === 'signal flare' ? 1.5 : 1;
    offer(get(guard.x, guard.z, (strength - .39 * distance(e, guard) / guard.range) * guard.power,
      guard.reason, guard.id, false));
  }
  if (best?.chase) e.memory = { ...best, until: time + (best.reason === 'gunshot' ? 11 : 7) };
  if (!best && e.approach?.role === 'cutoff' && e.approach.at <= time && e.approach.until > time && distance(e,e.approach) > 1)
    best = get(e.approach.x,e.approach.z,.27,'intercepting','approach',false);
  if (!best && e.memory?.until > time && distance(e, e.memory) > 1.1)
    best = { ...e.memory, score: .19, reason: 'last ' + e.memory.reason };
  if (!best && e.approach?.at <= time && e.approach.until > time && distance(e, e.approach) > 1)
    best = get(e.approach.x, e.approach.z, .12, 'approaching', 'approach', false);
  if (best && e.target && e.target.id !== best.id && e.swapAfter > time &&
    best.score < 1.2 && (!isFlareTarget(e.target.reason) || guard?.id === e.target.id))
    best = e.target;
  if (best?.id !== e.target?.id) e.swapAfter = time + .68;
  const nextReason = best?.reason || 'roaming';
  if (isFlareTarget(nextReason) && e.reason !== nextReason) run.metrics.guarded++;
  if (nextReason !== e.reason) e.changedAt = time;
  e.reason = nextReason;
  e.target = best;
}

function hurt(run, enemy) {
  const p = run.player;
  if (p.protection > 0) return;
  run.metrics.damage[enemy.kind] = (run.metrics.damage[enemy.kind] || 0) + 1;
  if (p.armor > 0) {
    p.armor--;
    p.protection = .82;
    emit(run, 'armorHit', { armor: p.armor, kind: enemy.kind });
    return;
  }
  p.reload = null;
  if (p.offhand) p.offhand.reload = null;
  run.status = 'dead';
  run.death = {
    kind: enemy.kind,
    yaw: angleDelta(Math.atan2(enemy.x - p.x, p.z - enemy.z), p.yaw),
    attacker: { id: enemy.id, x: enemy.x, y: enemy.y + ENEMIES[enemy.kind].height, z: enemy.z },
  };
  emit(run, 'death', { ...run.death });
}

function enemyVoice(run, enemy, type, contactPoint) {
  const height = type === 'swing' ? 1.1 : ENEMIES[enemy.kind].height * .84;
  const position = contactPoint || { x:enemy.x,y:enemy.y+height,z:enemy.z };
  emit(run, type, { id:enemy.id, ...position, kind:enemy.kind });
}

function voiceCadence(run, enemy, gap) {
  const { time } = run;
  const band = gap <= 5 ? 0 : gap <= 12 ? 1 : 2;
  if (band < enemy.voiceBand) {
    enemy.nextVoice = Math.min(enemy.nextVoice, Math.max(time, enemy.lastVoice + .48));
    enemy.voiceBand = band;
  }
  // Leave a margin on exit so hovering at the threshold doesn't retrigger.
  if (gap > 12.65) enemy.voiceBand = 2;
  else if (gap > 5.65 && enemy.voiceBand === 0) enemy.voiceBand = 1;
  if (gap > 21 || time < enemy.lastVoice + .48 || time < enemy.nextVoice) return;
  enemyVoice(run, enemy, 'voice');
  enemy.lastVoice = time;
  const variation = (enemy.voiceVariation + time * .53) % 1;
  enemy.nextVoice = time + (gap <= 5 ? 1.23 + variation * .27
    : gap <= 12 ? 1.95 + variation * .90
    : 4.1 + variation * 2.15);
}

function attack(run, enemy, gap, dt) {
  const p = run.player, shape = ENEMIES[enemy.kind];
  const toward = Math.atan2(p.x - enemy.x, enemy.z - p.z);
  const torso = { x:p.x, y:p.y + Math.min(1.17, p.eyeHeight*.73), z:p.z };
  const canReach = range => distance(enemy,p) < range && run.world.clear(eye(run.world, enemy, 1.02), torso);
  enemy.recover = Math.max(0, enemy.recover - dt);
  if (enemy.attackAge !== undefined) {
    const age = enemy.attackAge, windup = enemy.attackWindup;
    const contact = attackContact(enemy.kind);
    if (age < windup) {
      enemy.yaw += clamp(angleDelta(toward, enemy.yaw), -dt * 2.8, dt * 2.8);
      const power = Math.min(run.rules.speedLimit, enemy.kind === 'shrieker' ? 1.64 : enemy.kind === 'brute' ? .76 : 1.48);
      if (age > windup*.58 && gap > .74 && Math.abs(angleDelta(toward, enemy.yaw)) < .52) {
        run.world.move(enemy, Math.sin(enemy.yaw)*power*dt,-Math.cos(enemy.yaw)*power*dt,shape.width*.83);
        enemy.y = run.world.height(enemy.x,enemy.z);
      }
    }
    enemy.attackAge = age + dt;
    enemy.windup = Math.max(0, windup - enemy.attackAge);
    if (age < windup && enemy.attackAge + 1e-9 >= windup) {
      enemy.attackAge = windup;
      enemy.windup = 0;
      const hands = animatedAnchors(enemy, shape.windup);
      const right = hands[12], left = hands[6];
      const reaches = (elbow, hand) => {
        const x=hand.x-elbow.x, z=hand.z-elbow.z;
        const t=clamp(((torso.x-elbow.x)*x+(torso.z-elbow.z)*z)/(x*x+z*z || 1),0,1);
        const arm={x:elbow.x+t*x,z:elbow.z+t*z,y:elbow.y+t*(hand.y-elbow.y)};
        const body={...torso,y:clamp(arm.y,p.y+.69,torso.y)};
        return Math.hypot(arm.x-body.x,arm.y-body.y,arm.z-body.z)<.50 && run.world.clear(arm,body);
      };
      if (canReach(shape.reach+.48) && (reaches(hands[11],right) || reaches(hands[5],left))) {
        if (enemy.attackClip === 'Ambush' && run.player.protection <= 0) run.metrics.ambushes.hits++;
        hurt(run, enemy);
      }
      enemyVoice(run, enemy, 'swing', distance(right,p)<distance(left,p)?right:left);
    }
    if (enemy.attackAge >= windup / contact) {
      enemy.attackAge = undefined;
      enemy.attackFrom = null;
      enemy.recover = enemy.kind === 'brute' ? .65 : .28;
    }
    return true;
  }
  const triggerReach = shape.reach + (enemy.kind === 'shrieker' ? .54 : .36);
  if (enemy.recover <= 0 && run.nextAttack <= run.time && canReach(triggerReach)) {
    enemy.attackFrom = enemyMotion(enemy, shape.windup).filter(clip => clip[2] > 0);
    enemy.burstStart = enemy.burst = enemy.brakeUntil = 0;
    enemy.attackClip = enemy.ambush?.stage === 'emerging' ? 'Ambush' : 'Attack';
    enemy.attackWindup = enemy.attackClip === 'Ambush' ? Math.max(.46, shape.windup) : shape.windup;
    enemy.attackAge = 0;
    enemy.windup = enemy.attackWindup;
    enemy.moveSpeed = enemy.stride = 0;
    enemy.footing = enemy.plantLocks = null;
    run.nextAttack = run.time + .33;
    enemyVoice(run, enemy, 'windup');
    enemy.lastVoice = run.time;
    return true;
  }
  return false;
}

function navigate(run, e, tx, tz, dt) {
  const cfg = ENEMIES[e.kind], { time, world } = run;
  const desired = Math.atan2(tx - e.x, e.z - tz);
  let vx = Math.sin(desired), vz = -Math.cos(desired);
  for (const other of run.enemies) {
    if (other === e || other.dead) continue;
    const dx = e.x - other.x, dz = e.z - other.z, d = dx*dx + dz*dz;
    if (d > .001 && d < .98) {
      vx += dx * (.98 - d) / Math.sqrt(d) * 1.15;
      vz += dz * (.98 - d) / Math.sqrt(d) * 1.15;
    }
  }
  const targetAngle = Math.atan2(vx, -vz), look = e.kind === 'brute' ? 2.7 : 4.5;
  const turnDelta = clamp(angleDelta(targetAngle, e.yaw), -dt * look, dt * look);
  e.yaw += turnDelta;
  e.turnRate = turnDelta / dt;
  const burst = burstPhase(e, time), isBurst = burst === 'Sprint';
  const phase = e.gait;
  const stepPace = 1 + (e.kind === 'brute' ? .14 : .11) * Math.sin(2*phase) +
    (e.kind === 'shambler' ? .14 : .06) * Math.sin(phase);
  const progress = e.stumble > 0 ? 1 - e.stumble/e.stumbleDuration : 0;
  const stumblePace = progress > 0 ? 1 - .43 * Math.sin(Math.PI*progress) + .16 * Math.sin(2*Math.PI*progress) : 1;
  const speedTarget = (isBurst ? run.rules.speedLimit : cfg.speed * e.pace * stepPace * stumblePace) * (e.target ? 1 : .64) *
    (e.slow > 0 ? .54 : 1) * (e.stun > 0 ? .42 : 1) * (e.recover > .32 ? .35 : 1);
  const previous = e.moveSpeed;
  const targetSpeed = Math.min(run.rules.speedLimit, burst === 'BurstLoad' ? .18 : burst === 'Brake' ? speedTarget*.62
    : e.ambush?.stage === 'emerging' ? Math.max(1.75,speedTarget*1.62)
    : e.ambush?.stage === 'seeking' ? Math.max(1.25,speedTarget) : speedTarget);
  const speed = e.moveSpeed += clamp(targetSpeed - e.moveSpeed, -dt * 5.4, dt * (e.kind === 'brute' ? 2.2 : 4.6));
  if (previous < .13 && speed >= .13) e.startAge = 0;
  const oldX = e.x, oldZ = e.z, radius = cfg.width * .83;
  for (const turn of [0, .59, -.59, 1.15, -1.15, 1.72, -1.72, 2.22]) {
    const vector = direction(e.yaw + turn * e.turnSide);
    const probe = Math.max(.68, speed * .47);
    if (world.blocks(e.x + vector.x * probe, e.z + vector.z * probe, radius + .06)) continue;
    world.move(e, vector.x * dt * speed, vector.z * dt * speed, radius);
    if (turn) e.yaw += clamp(turn * e.turnSide, -dt * look, dt * look);
    if (distance(e, { x: oldX, z: oldZ }) > .001) break;
  }
  const moved = Math.hypot(e.x - oldX, e.z - oldZ);
  e.stuck = moved < .001 ? e.stuck + dt : Math.max(0, e.stuck - dt * 3);
  if (e.stuck > 1.1) { e.turnSide *= -1; e.roam += 1.6; e.stuck = 0; }
  if (moved > .012 && !burst && time > e.nextStumble) {
    e.stumbleDuration = (e.kind === 'brute' ? .92 : e.kind === 'shrieker' ? .49 : .75) * (1.17 - .19*e.pace);
    e.stumble = e.stumbleDuration;
    e.nextStumble = time + 3.7 + run.rng()*6.5;
  }
  e.stride = moved / dt;
  const sprintStride = 1.95 * cfg.height / ENEMIES.shambler.height;
  const stride = isBurst || burst === 'Brake' ? sprintStride : strideLength(e.kind);
  e.gait += moved * Math.PI * 2 / stride;
  e.y = world.height(e.x, e.z);
  updateEnemyFooting(world,e,cfg.windup,distance(run.player,e));
}

function updateEnemies(run, dt, lamps) {
  const { player: p, world, time } = run;
  reserveAmbush(run);
  if (time >= run.nextSwarmTick) {
    flareAssignments(run);
    run.nextSwarmTick = time + .26;
  }
  let pursuing = 0, diverted = 0;
  for (const e of run.enemies) {
    if (e.dead) continue;
    const gap = distance(e, p);
    if (gap > 68) { e.dead = true; continue; }
    if (time >= e.nextThink) {
      perception(run, e, gap, lamps);
      e.nextThink = time + (gap < 24 ? .20 : .48) + run.rng() * .08;
    }
    if (e.target?.chase) pursuing++;
    if (isFlareTarget(e.reason)) diverted++;
    e.stun = Math.max(0, e.stun - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.stumble = Math.max(0, e.stumble - dt);
    e.poseTime = time;
    Object.assign(e.previousTransform, { x: e.x, y: e.y, z: e.z, yaw: e.yaw });
    e.startAge += dt;
    e.hitAge += dt;
    e.turnRate = 0;
    if (e.ambush) {
      const at = eye(world,e,1.28);
      const revealed = lamps.some(lamp => inBeam(world,lamp,at));
      const maneuver = ambushDecision(run,e,gap,revealed);
      if (maneuver) {
        e.reason = maneuver.reason;
        e.route = maneuver.destination && {x:maneuver.destination.x,z:maneuver.destination.z};
        const exposed = e.ambush.stage==='emerging' && world.clear(eye(world,e,1.24),eye(world,p,1.15));
        if (exposed && attack(run,e,gap,dt)) {
          if (run.status==='dead') break;
          continue;
        }
        voiceCadence(run,e,gap);
        if (maneuver.destination) navigate(run,e,maneuver.destination.x,maneuver.destination.z,dt);
        else { e.moveSpeed=e.stride=0; e.footing=e.plantLocks=null; }
        continue;
      }
    }
    if (attack(run, e, gap, dt)) {
      if (run.status === 'dead') break;
      continue;
    }
    if (e.kind === 'shrieker' && e.target?.chase && gap > 3.4 && gap < 13 && time > e.nextBurst && e.stun <= 0) {
      e.burstStart = time + BURST_LOAD;
      e.burst = e.burstStart + BURST_RUN;
      e.brakeUntil = e.burst + BURST_BRAKE;
      e.nextBurst = time + 4.2 + run.rng() * 1.5;
      enemyVoice(run, e, 'shriek');
      e.lastVoice = time;
    } else voiceCadence(run, e, gap);
    const t = e.target;
    if (!t) {
      if (time > e.nextRoam) { e.roam += (run.rng() - .43) * 2.6; e.nextRoam = time + 2.2 + run.rng() * 4; }
      const wander = direction(e.roam);
      navigate(run, e, e.x + wander.x * 4, e.z + wander.z * 4, dt);
      e.route = null;
    } else {
      const approach = distance(e, t);
      let tx = t.x, tz = t.z;
      if (e.flank && t.chase && approach > 3.7 && approach < 25) {
        const x = t.x - e.x, z = t.z - e.z, side = Math.min(5.4, approach * .47) * e.flank;
        const turnX = tx + z / approach * side, turnZ = tz - x / approach * side;
        if (!world.blocks(turnX, turnZ, .65)) { tx = turnX; tz = turnZ; }
      }
      e.route = { x: tx, z: tz };
      if (approach > (t.chase ? .80 : 1.25)) navigate(run, e, tx, tz, dt);
      else {
        e.footing=e.plantLocks=null;
        e.moveSpeed=e.stride=0;
        if (!t.chase) e.yaw += dt * .72 * e.turnSide;
      }
    }
  }
  run.enemies = run.enemies.filter(e => !e.dead);
  run.metrics.peakPursuit = Math.max(run.metrics.peakPursuit, pursuing);
  run.metrics.peakDiversion = Math.max(run.metrics.peakDiversion, diverted);
  run.metrics.pressureSeconds += pursuing ? dt : 0;
  run.metrics.lootFlareSeconds += diverted ? dt : 0;
}

export function defaultAim(run, pitch = 0, offhand = false) {
  const { player: p } = run, v = direction(p.yaw);
  const side = offhand ? -.18 : .18;
  return { origin: { x: p.x - v.z * side + v.x * .34, y: p.y + p.eyeHeight - .17, z: p.z + v.x * side + v.z * .34 },
    ray: { x: v.x * Math.cos(pitch), y: Math.sin(pitch), z: v.z * Math.cos(pitch) } };
}

export function visibleTargets(run, soundMemory = false) {
  const p = run.player, origin = eye(run.world, p, p.eyeHeight);
  const lamps = activeBeams(run);
  const visible = [];
  for (const e of run.enemies) {
    const d = distance(p, e), head = enemyPose(e).head;
    if (d < 3.8 || lamps.some(lamp => inBeam(run.world, lamp, head))
      || (soundMemory && p.noisePeak > run.time && d < 11)) {
      if (run.world.clear(origin, head)) visible.push(e);
    }
  }
  return visible.sort((a, b) => distance(p, a) - distance(p, b));
}

function movePlayer(run, dx, dz) {
  const { player, world } = run;
  if (!dx && !dz) return;
  for (const enemy of run.enemies) {
    if (enemy.dead) continue;
    const x = enemy.x-player.x, z = enemy.z-player.z, near = Math.hypot(x,z);
    if (near < .01 || Math.hypot(x-dx,z-dz) >= ARMS + ENEMIES[enemy.kind].width*.85) continue;
    const toward = (dx*x+dz*z)/(near*near);
    if (toward > 0) { dx -= toward*x; dz -= toward*z; }
  }
  world.move(player,dx,dz,ARMS);
}

export function stepRun(run, input = {}, dt = STEP) {
  run.events.length = 0;
  if (run.status !== 'playing') return run.events;
  const { player: p, world } = run;
  run.time += dt;
  p.cooldown = Math.max(0, p.cooldown - dt);
  if (p.offhand) p.offhand.cooldown = Math.max(0, p.offhand.cooldown - dt);
  p.protection = Math.max(0, p.protection - dt);
  p.yaw = input.yaw ?? p.yaw;
  p.eyeHeight = input.eyeHeight ?? p.eyeHeight;
  updateFlashlights(run, input, dt);
  const mx = input.moveX || 0, mz = input.moveZ || 0, mag = Math.max(1, Math.hypot(mx, mz));
  const old = { x: p.x, y: p.y, z: p.z };
  const speed = input.walk ? 1.30 : 2.72;
  movePlayer(run, mx/mag * dt*speed, mz/mag * dt*speed);
  if (input.roomX || input.roomZ) world.move(p, clamp(input.roomX || 0, -.36, .36), clamp(input.roomZ || 0, -.36, .36), ARMS);
  p.y = world.height(p.x, p.z);
  const shift = { x: p.x - old.x, y: p.y - old.y, z: p.z - old.z };
  const velocityBlend = Math.min(1, dt*2.8);
  p.travelX += ((shift.x/dt)-p.travelX)*velocityBlend;
  p.travelZ += ((shift.z/dt)-p.travelZ)*velocityBlend;
  const translate = origin => ({ x:origin.x+shift.x, y:origin.y+shift.y, z:origin.z+shift.z });
  const shiftPose = pose => pose && { origin: translate(pose.origin), ray: norm(pose.ray),
    viewOrigin: pose.viewOrigin && translate(pose.viewOrigin) };
  const aim = shiftPose(input.aim) || defaultAim(run, input.pitch);
  const head = eye(world, p, p.eyeHeight);
  aim.viewOrigin ||= head;
  const lamp = input.lampUnavailable ? null : shiftPose(input.lamp) || { origin: { ...head, y: head.y - .16 }, ray: aim.ray };
  run.beam = resolvePlayerBeam(run, lamp, aim.viewOrigin);
  const offhandLamp = p.offhand && !input.offhandUnavailable
    ? shiftPose(input.offhandLamp) || defaultAim(run, input.pitch, true) : null;
  run.offhandBeam = resolvePlayerBeam(run, offhandLamp, aim.viewOrigin, true);
  const lamps = activeBeams(run);
  p.stepDistance += Math.hypot(shift.x, shift.z);
  if (p.stepDistance > (input.walk ? .70 : .79)) {
    p.stepDistance = 0;
    const road = world.roadDistance(p.x, p.z) < 2.9;
    const radius = (road ? 9.5 : 15) * (input.walk ? .62 : 1);
    noise(run, 'footstep', eye(world, p, .26), radius, 1.56);
    emit(run, 'footstep', { road, quiet: Boolean(input.walk) });
  }
  if (input.cycleWeapon) cycleWeapon(run);
  finishReload(run, p, dt);
  if (p.offhand) finishReload(run, p.offhand, dt);
  if (input.reload) {
    startReload(run);
    if (p.offhand) startReload(run, true);
  }
  if ((input.fire || (input.fireHeld && p.weapon === 'smg')) && !input.weaponUnavailable) shoot(run, aim);
  if (p.offhand && input.offhandFire && !input.offhandUnavailable) {
    const offhand = shiftPose(input.offhandAim) || defaultAim(run, input.pitch, true);
    offhand.viewOrigin ||= head;
    shoot(run, offhand, true);
  }
  if (run.time - run.lastChunkCheck > .65) {
    updateLandmarks(run);
    run.lastChunkCheck = run.time;
  }
  const cap = activeHordeLimit(run);
  if (run.time - run.lastBuildingCheck >= .40) {
    visitBuildings(run,run.populate ? cap : 0,addEnemy);
    run.lastBuildingCheck = run.time;
  }
  const radio = reachableRadio(run);
  takeLoot(run, input.interact && !radio);
  if (radio) {
    run.offer = radio;
    if (input.interact) {
      run.status = 'escaped';
      p.reload = null;
      if (p.offhand) p.offhand.reload = null;
      emit(run, 'extraction', { ...radio });
      return run.events;
    }
  }
  if (!p.ammo && !p.reload && p.equippedReserve > 0) startReload(run);
  if (p.offhand?.ammo === 0 && !p.offhand.reload && p.reserve > 0) startReload(run, true);
  if (run.populate && run.time >= run.nextLoot) {
    majorDrop(run);
    run.nextLoot = run.time + 48 + run.rng() * 14;
  }
  if (run.populate && run.time >= run.nextSpawn) {
    replenishHorde(run, cap, lamps, addEnemy);
    const age = pressureTime(run);
    run.nextSpawn = run.time + run.rules.arrivals * (age < run.rules.opening ? 2.7 : Math.max(.55, 1.42 - age / 580));
  }
  updateSignalFlares(run, dt);
  updateEnemies(run, dt, lamps);
  run.noises = run.noises.filter(n => run.time < n.born + n.span);
  run.metrics.maxCrowd = Math.max(run.metrics.maxCrowd, run.enemies.length);
  return run.events;
}

export function inspectFlashlights(run, input = {}) {
  if (run.status === 'dead') updateFlashlights(run, input, 0);
}

function updateFlashlights(run, input, dt) {
  const p = run.player;
  if (p.offhand) {
    if (input.cyclePrimaryBeam || input.toggleBeam) p.beam = beamCycle[p.beam];
    if (input.cycleOffhandBeam || input.toggleLight) p.offhand.beam = beamCycle[p.offhand.beam];
    p.flashlight = p.beam !== 'off' || p.offhand.beam !== 'off';
    return;
  }
  if (input.toggleLight && (p.flashlight || p.battery > .04)) {
    p.flashlight = !p.flashlight;
    if (run.status === 'playing') emit(run, 'light', { on: p.flashlight });
  }
  if (input.toggleBeam) p.beam = p.beam === 'focus' ? 'wide' : 'focus';
  const runtime = 30 + p.upgrades.battery * 8;
  p.battery = clamp(p.battery + (p.flashlight ? (input.lampUnavailable ? 0 : -dt / runtime) : dt / 5), 0, 1);
  if (p.flashlight && p.battery <= 1e-8) {
    p.flashlight = false;
    if (run.status === 'playing') emit(run, 'light', { on: false, empty: true });
  }
}

function finishReload(run, state, dt) {
  if (!state.reload) return;
  state.reload.left -= dt;
  if (state.reload.left > 1e-8) return;
  const p = run.player;
  const amount = Math.min(magazineCapacity(p) - state.ammo, p.equippedReserve);
  state.ammo += amount;
  if (p.weapon === 'flaregun') p.flares -= amount;
  else p.reserve -= amount;
  state.reload = null;
  if (amount > 0) emit(run, 'loaded', { weapon: p.weapon, offhand: state === p.offhand });
}
