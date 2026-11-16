import { angleDelta, clamp, createWorld, direction, distance, random, START } from './world.js';

export const STEP = 1 / 30;
export const BUILD = '1.0.0';
export const GUNS = {
  pistol: { name: 'Service pistol', capacity: 6, reload: 1.5, interval: .31, range: 65, damage: 1.24, noise: 44, rounds: 1, spread: .003 },
  shotgun: { name: 'Pump shotgun', capacity: 4, reload: 2.2, interval: .83, range: 34, damage: .91, noise: 57, rounds: 7, spread: .077 },
  smg: { name: 'Compact SMG', capacity: 24, reload: 1.8, interval: .102, range: 49, damage: .93, noise: 48, rounds: 1, spread: .02 },
};
export const ENEMIES = {
  shambler: { speed: 1.12, height: 1.77, width: .28, hp: 3.2, windup: .60, reach: 1.19 },
  shrieker: { speed: 1.62, height: 1.66, width: .23, hp: 2.4, windup: .38, reach: 1.16 },
  brute: { speed: .83, height: 2, width: .36, hp: 6.6, windup: .83, reach: 1.35 },
};
export const UPGRADES = {
  damage: { name: 'Hot loads', icon: '▲', cap: 3, color: '#ff8b70', description: '+15% damage' },
  pierce: { name: 'Piercing rounds', icon: '»', cap: 2, color: '#ffb36c', description: '+1 target per shot' },
  reload: { name: 'Speed loader', icon: '↻', cap: 3, color: '#f1cd86', description: '15% faster reload' },
  battery: { name: 'Battery cells', icon: 'ϟ', cap: 3, color: '#a6d6a0', description: '+8 seconds of light' },
  lens: { name: 'Focus lens', icon: '◇', cap: 3, color: '#9adae6', description: '+3 metres of light' },
};
export const LOOT = {
  ...UPGRADES,
  ammo: { name: 'Spare rounds', icon: '⋮', color: '#bac5b8' },
  pistol: { name: 'Service pistol', icon: 'pistol', color: '#f0cc91' },
  shotgun: { name: 'Pump shotgun', icon: 'shotgun', color: '#ffd299' },
  smg: { name: 'Compact SMG', icon: 'smg', color: '#ebbc91' },
  armor1: { name: 'Padded vest', icon: 'Ⅰ', color: '#9cb9ce' },
  armor2: { name: 'Protective vest', icon: 'Ⅱ', color: '#abc5e0' },
  armor3: { name: 'Heavy plates', icon: 'Ⅲ', color: '#bbd6ec' },
};
const POINT = { x: 0, y: 0, z: -1 };
const ARMS = .29;
const RESERVE_MAX = 125;
const MAX_LOOSE_LOOT = 72;
const eye = (world, next, tall = 1.4) => ({ x: next.x, y: world.height(next.x, next.z) + tall, z: next.z });

export function flarePower(age) {
  if (age <= 5) return 1;
  const fade = clamp((25 - age) / 20, 0, 1);
  return fade * fade * (3 - 2 * fade);
}

export function hordeTarget(time) {
  return Math.min(48, 10 + Math.floor(time < 300 ? time * 22 / 300 : 22 + (time - 300) * 16 / 240));
}

export function beamSettings(player) {
  const focus = player.beam === 'focus';
  return { range: (focus ? 23 : 15) + player.upgrades.lens * 3, angle: focus ? .235 : .49 };
}

function norm(v) {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 0 ? { x: v.x / length, y: v.y / length, z: v.z / length } : POINT;
}

function inBeam(world, beam, at, range, angle) {
  const dx = at.x - beam.origin.x, dy = at.y - beam.origin.y, dz = at.z - beam.origin.z;
  const d = Math.hypot(dx, dy, dz);
  return d < range && dx * beam.ray.x + dy * beam.ray.y + dz * beam.ray.z >= Math.cos(angle) * d
    && world.clear(beam.origin, at);
}

export function enemyPose(enemy) {
  const shape = ENEMIES[enemy.kind];
  const heading = direction(enemy.yaw);
  const sway = (enemy.kind === 'shambler' ? .091 : .044) * Math.sin(enemy.gait);
  const attack = enemy.windup <= 0 ? 0 : Math.sin(Math.PI * clamp(1 - enemy.windup / shape.windup, 0, 1));
  const lean = (enemy.kind === 'shrieker' ? .16 : .065) + attack * .15;
  return {
    head: { x: enemy.x + heading.x * lean - heading.z * sway, y: enemy.y + shape.height - .14 + .022 * Math.sin(enemy.gait * 2), z: enemy.z + heading.z * lean + heading.x * sway },
    torso: { x: enemy.x + heading.x * .035, y: enemy.y + shape.height * .63, z: enemy.z + heading.z * .035 },
  };
}

function raySphere(origin, ray, center, radius) {
  const x = center.x - origin.x, y = center.y - origin.y, z = center.z - origin.z;
  const projection = x * ray.x + y * ray.y + z * ray.z;
  const h = radius * radius - (x*x + y*y + z*z - projection * projection);
  return h >= 0 && projection >= 0 ? Math.max(0, projection - Math.sqrt(h)) : Infinity;
}

function emit(run, type, data = {}) {
  run.events.push({ type, ...data });
}

export function createRun(seed, { crowdLimit = 48, populate = true } = {}) {
  const world = createWorld(seed);
  const run = {
    seed, world, rng: random(seed + ':run'), time: 0, status: 'playing', crowdLimit,
    player: { ...START, y: world.height(START.x, START.z), eyeHeight: 1.63, yaw: 0,
      weapon: 'pistol', ammo: 6, reserve: 50, armor: 0, protection: 0, reload: null, cooldown: 0,
      flashlight: true, battery: 1, beam: 'wide', upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
      stepDistance: 0, kills: 0, headshots: 0, noisePeak: 0 },
    enemies: [], loot: [], settledLoot: new Set(), events: [], noises: [], corpses: [],
    nextId: 1, nextSpawn: 2, nextLoot: 33, lastChunkCheck: -Infinity, dryKills: 0,
    nextAttack: 0, nextSwarmTick: 0, death: null, populate, notice: '',
    metrics: { shots: 0, dryFire: 0, roundsPicked: 0, upgrades: 0, guarded: 0, lootFlareSeconds: 0,
      pressureSeconds: 0, damage: {}, pickups: {}, maxCrowd: 0, peakPursuit: 0, peakDiversion: 0 },
  };
  updateLandmarks(run);
  if (populate) {
    for (let i = 0; i < 26 && run.enemies.length < 10; i++) spawnFromCover(run, i % 2 === 0);
    const disturbed = run.enemies.slice().sort((a,b) => distance(a, run.player) - distance(b, run.player)).slice(0, 3);
    for (const enemy of disturbed) {
      enemy.memory = { x: START.x, z: START.z - 1.6, id: 'disturbance', reason: 'footstep', chase: true, until: 25 };
    }
  }
  run.events.length = 0;
  return run;
}

export function addEnemy(run, kind, x, z) {
  const index = run.nextId++, p = run.player, cfg = ENEMIES[kind];
  const enemy = { id: index, kind, x, y: run.world.height(x, z), z,
    yaw: Math.atan2(p.x - x, x === p.x && z === p.z ? -1 : z - p.z),
    hp: cfg.hp, pace: .87 + run.rng() * .28, gait: run.rng() * Math.PI * 2,
    nextThink: run.time + run.rng() * .36, nextVoice: run.time + 1 + run.rng() * 5,
    target: null, reason: 'roaming', memory: null, swapAfter: 0,
    flank: index % 5 < 2 ? (index % 2 ? -1 : 1) : 0,
    roam: run.rng() * Math.PI * 2, nextRoam: run.time + 3, windup: 0, recover: 0,
    slow: 0, stun: 0, burst: 0, nextBurst: run.time + 1, turnSide: index % 2 ? 1 : -1, stuck: 0, stride: 0,
  };
  run.enemies.push(enemy);
  return enemy;
}

function spawnFromCover(run, front) {
  const { player: p, world } = run;
  const view = eye(world, p, p.eyeHeight);
  const forward = direction(p.yaw), beam = run.beam;
  let sites = null;
  for (let i = 0; i < 26; i++) {
    let x, z;
    if (i > 15) {
      sites ||= world.around(p.x, p.z, 32).flatMap(area => area.entrances);
      const site = sites[Math.floor(run.rng() * sites.length)];
      if (!site) continue;
      ({ x, z } = site);
    } else {
      const angle = (front ? p.yaw + (run.rng() < .5 ? -1 : 1) * (1.05 + run.rng() * .85) : run.rng() * Math.PI * 2);
      const dir = direction(angle), d = 14 + run.rng() * 19;
      x = p.x + dir.x * d; z = p.z + dir.z * d;
    }
    const d = distance(p, { x, z });
    if (d < 13 || d > 35 || (forward.x * (x - p.x) + forward.z * (z - p.z)) / d > .53) continue;
    if (world.blocks(x, z, .48) || run.enemies.some(e => distance(e, { x, z }) < 1.65)) continue;
    const spot = eye(world, { x, z }, 1.35);
    if (beam && p.flashlight && inBeam(world, beam, spot, beamSettings(p).range, beamSettings(p).angle)) continue;
    if (world.clear(view, spot)) continue;
    const roll = run.rng();
    const brute = clamp((run.time - 47) / 570, 0, .23);
    const shrieker = clamp((run.time - 23) / 400 + .05, .04, .26);
    addEnemy(run, roll < brute ? 'brute' : roll < brute + shrieker ? 'shrieker' : 'shambler', x, z);
    return true;
  }
  return false;
}

export function setLoot(run, kind, x, z, id = 'drop:' + run.nextId++, amount = 0, carried = false) {
  if (run.settledLoot.has(id)) return null;
  const y = run.world.height(x, z);
  const loot = { id, kind, x, z, y, born: run.time - (carried ? 25 : 0), amount,
    availableAt: run.time + (carried ? 2.5 : 0), landmark: !id.startsWith('drop:') };
  run.loot.push(loot);
  if (kind !== 'ammo' && !carried) emit(run, 'flare', { x, y: y + .4, z, kind });
  return loot;
}

function updateLandmarks(run) {
  const known = new Set(run.loot.map(l => l.id));
  const { player: p, world } = run;
  for (const area of world.around(p.x, p.z, 60)) {
    for (const site of area.loot) {
      if (run.time >= site.unlock && distance(p, site) < 35 && !known.has(site.id))
        setLoot(run, site.kind, site.x, site.z, site.id, site.kind === 'ammo' ? 16 : 0);
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
  const options = Object.keys(UPGRADES).filter(k => p.upgrades[k] < UPGRADES[k].cap);
  options.push(run.time < 130 ? 'armor1' : run.time < 255 ? 'armor2' : 'armor3');
  if (run.time > 54) options.push(p.weapon === 'shotgun' ? 'smg' : 'shotgun');
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
  run.corpses.push({ ...e, headshot, diedAt: run.time });
  if (run.corpses.length > 21) run.corpses.shift();
  emit(run, 'kill', { ...enemyPose(e).torso, kind: e.kind, headshot });
  run.dryKills++;
  if (run.rng() < .37 || run.dryKills >= 3) {
    setLoot(run, 'ammo', e.x, e.z, undefined, e.kind === 'brute' ? 12 : 5 + Math.floor(run.rng() * 3));
    run.dryKills = 0;
  } else if (run.rng() < .09 || (e.kind === 'brute' && run.rng() < .25)) {
    const eligible = Object.keys(UPGRADES).filter(k => p.upgrades[k] < UPGRADES[k].cap);
    eligible.push(run.time < 110 ? 'armor1' : run.time < 260 ? 'armor2' : 'armor3');
    setLoot(run, eligible[Math.floor(run.rng() * eligible.length)], e.x, e.z);
  }
}

export function shoot(run, aim) {
  const { player: p, world } = run, gun = GUNS[p.weapon];
  if (run.status !== 'playing' || p.cooldown > 0 || p.reload) return;
  if (!p.ammo) {
    run.metrics.dryFire++;
    p.cooldown = .32;
    emit(run, 'dry', { reason: p.reserve ? 'Reload' : 'No spare rounds' });
    return;
  }
  const o = aim.origin, center = norm(aim.ray);
  p.ammo--;
  p.cooldown = gun.interval;
  p.noisePeak = run.time + .28;
  run.metrics.shots++;
  noise(run, 'gunshot', o, gun.noise, 2.8);
  emit(run, 'shot', { ...o, ray: center, weapon: p.weapon });
  const possible = run.enemies.filter(e => !e.dead && distance(e, o) <= gun.range + 1);
  const hits = new Map();
  for (let shot = 0; shot < gun.rounds; shot++) {
    const spread = gun.spread;
    const ray = norm({ x: center.x + (run.rng() - .5) * spread * 2,
      y: center.y + (run.rng() - .5) * spread * 2, z: center.z + (run.rng() - .5) * spread * 2 });
    const solid = world.raycast(o, ray, gun.range);
    const max = solid?.t ?? gun.range;
    const candidates = [];
    for (const e of possible) {
      const cfg = ENEMIES[e.kind], { head, torso } = enemyPose(e);
      const h = raySphere(o, ray, head, e.kind === 'brute' ? .175 : .147);
      const b = Math.min(raySphere(o, ray, torso, cfg.width),
        raySphere(o, ray, { ...torso, y: e.y + cfg.height * .49 }, cfg.width * .83));
      const l = raySphere(o, ray, { x: e.x, y: e.y + cfg.height * .26, z: e.z }, cfg.width * .85);
      const t = Math.min(h, b, l);
      if (t < max) candidates.push({ e, t, head: h <= b && h <= l, limb: l < h && l < b });
    }
    candidates.sort((a, b) => a.t - b.t);
    const penetrates = 1 + (p.weapon === 'shotgun' && shot !== 0 ? 0 : p.upgrades.pierce);
    for (let i = 0; i < Math.min(penetrates, candidates.length); i++) {
      const hit = candidates[i];
      const current = hits.get(hit.e) || { total: 0, head: false, firstHead: false, ...hit,
        point: { x: o.x + ray.x * hit.t, y: o.y + ray.y * hit.t, z: o.z + ray.z * hit.t } };
      current.total += gun.damage * (1 + p.upgrades.damage * .15) * .57 ** i * (hit.head ? 2.8 : hit.limb ? .68 : 1);
      current.head ||= hit.head;
      current.firstHead ||= hit.head && i === 0;
      current.limb ||= hit.limb;
      hits.set(hit.e, current);
    }
    if (solid && shot === 0 && candidates.length < penetrates)
      emit(run, 'impact', { x: o.x + ray.x * solid.t, y: o.y + ray.y * solid.t, z: o.z + ray.z * solid.t, surface: solid.kind });
  }
  for (const [enemy, hit] of hits) {
    enemy.hp -= hit.total;
    enemy.stun = hit.total > 1.1 ? .15 : .07;
    if (hit.limb) enemy.slow = 1.3;
    emit(run, 'impact', { ...hit.point, surface: 'body' });
    if ((hit.firstHead && enemy.kind !== 'brute') || enemy.hp <= 0) eliminate(run, enemy, hit.head);
  }
}

export function startReload(run) {
  const p = run.player, gun = GUNS[p.weapon];
  if (p.reload || !p.reserve || p.ammo >= gun.capacity || run.status !== 'playing') return false;
  const duration = gun.reload * .85 ** p.upgrades.reload;
  p.reload = { duration, left: duration, weapon: p.weapon };
  emit(run, 'reload', { weapon: p.weapon });
  return true;
}

function takeLoot(run, confirm) {
  const p = run.player;
  const nearby = run.loot.filter(l => !l.lost && l.availableAt <= run.time && Math.abs(l.x - p.x) < 1.5 && distance(l, p) < 1.19)
    .sort((a, b) => distance(a, p) - distance(b, p));
  run.offer = null;
  let swap = null;
  for (const l of nearby) {
    const k = l.kind;
    if ((k in GUNS && k === p.weapon) || (k.startsWith('armor') && Number(k.at(-1)) <= p.armor)) continue;
    if (!run.world.clear(eye(run.world, p, .6), { ...l, y: l.y + .44 })) continue;
    if ((k in GUNS && k !== p.weapon) || k.startsWith('armor')) {
      if (!swap) { swap = l; run.offer = l; }
      continue;
    }
    if (k === 'ammo') {
      const got = Math.max(0, Math.min(RESERVE_MAX - p.reserve, l.amount || 7));
      if (!got) continue;
      p.reserve += got;
      run.metrics.roundsPicked += got;
      take(run, l, '+' + got + ' rounds');
    } else if (k in UPGRADES && p.upgrades[k] < UPGRADES[k].cap) {
      p.upgrades[k]++;
      run.metrics.upgrades++;
      take(run, l, LOOT[k].name + ' · ' + UPGRADES[k].description);
    }
  }
  if (!confirm || !swap) return;
  if (swap.kind in GUNS) {
    const old = p.weapon;
    // Preserve the rounds in the replaced gun without creating ammunition.
    const pool = p.reserve + p.ammo;
    p.weapon = swap.kind;
    p.ammo = Math.min(p.ammo, GUNS[p.weapon].capacity);
    p.reserve = pool - p.ammo;
    p.reload = null;
    p.cooldown = .25;
    setLoot(run, old, swap.x, swap.z, undefined, 0, true);
  } else p.armor = Number(swap.kind.at(-1));
  take(run, swap, LOOT[swap.kind].name);
  run.offer = null;
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
  const budget = Math.max(1, Math.round(run.enemies.length * .27));
  const candidates = run.loot.filter(item => !item.lost && item.kind !== 'ammo' && run.time - item.born < 25);
  candidates.sort((a, b) => b.born - a.born || distance(a, p) - distance(b, p));
  for (const loot of candidates) {
    if (next.size >= budget) break;
    if (loot.lost || loot.kind === 'ammo' || distance(loot, p) > 47) continue;
    const power = flarePower(run.time - loot.born);
    if (power < .04) continue;
    const range = 17 * Math.sqrt(power);
    const nearby = run.enemies.filter(e => !e.dead && distance(e, loot) < range && distance(p, e) > 3.1);
    const lit = { ...loot, y: loot.y + .48 };
    const limit = Math.min(3, budget - next.size, Math.round(nearby.length * .25 * Math.sqrt(power)));
    if (!limit) continue;
    const choices = nearby.filter(e => !next.has(e.id) && world.clear(eye(world, e), lit))
      .sort((a, b) => distance(a, loot) - distance(b, loot) + (a.target?.id === loot.id ? -2.2 : 0)
        + (b.target?.id === loot.id ? 2.2 : 0));
    for (const e of choices.slice(0, limit)) next.set(e.id, { ...loot, power, range });
  }
  run.guards = next;
}

function perception(run, e, gap) {
  const { world, player: p, time } = run, origin = eye(world, e, ENEMIES[e.kind].height * .87);
  const player = eye(world, p, p.eyeHeight * .8);
  const get = (x, z, score, reason, id, chase) => ({ x, z, score, reason, id, chase });
  let best = null;
  const offer = candidate => { if (!best || candidate.score > best.score) best = candidate; };
  if (gap < 5.1 && world.clear(origin, player))
    offer(get(p.x, p.z, gap < 3.1 ? 4 : 1.15, 'saw player', 'player', true));
  const beam = beamSettings(p);
  if (p.flashlight && gap < beam.range + 5 && run.beam) {
    const { origin: lamp, ray } = run.beam;
    const lampEnd = { x: lamp.x + ray.x * .4, y: lamp.y + ray.y * .4, z: lamp.z + ray.z * .4 };
    const litGround = { ...origin, y: e.y + .28 };
    if (inBeam(world, run.beam, origin, beam.range, beam.angle) ||
      inBeam(world, run.beam, litGround, beam.range, beam.angle) ||
      (gap < 7 && world.clear(origin, lampEnd))) {
      offer(get(lamp.x, lamp.z, 1.08 - gap / (beam.range + 10) * .57, 'flashlight', 'lamp', true));
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
    offer(get(guard.x, guard.z, (1.0 - .39 * distance(e, guard) / guard.range) * guard.power,
      'loot flare', guard.id, false));
  }
  if (best?.chase) e.memory = { ...best, until: time + (best.reason === 'gunshot' ? 11 : 7) };
  if (!best && e.memory?.until > time && distance(e, e.memory) > 1.1)
    best = { ...e.memory, score: .19, reason: 'last ' + e.memory.reason };
  if (best && e.target && e.target.id !== best.id && e.swapAfter > time &&
    best.score < 1.2 && (e.target.reason !== 'loot flare' || guard?.id === e.target.id))
    best = e.target;
  if (best?.id !== e.target?.id) e.swapAfter = time + .68;
  const nextReason = best?.reason || 'roaming';
  if (nextReason === 'loot flare' && e.reason !== nextReason) run.metrics.guarded++;
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
  run.status = 'dead';
  run.death = { kind: enemy.kind, yaw: angleDelta(Math.atan2(enemy.x - p.x, p.z - enemy.z), p.yaw) };
  emit(run, 'death', { ...run.death });
}

function attack(run, enemy, gap, dt) {
  const p = run.player, shape = ENEMIES[enemy.kind];
  const toward = Math.atan2(p.x - enemy.x, enemy.z - p.z);
  const canReach = () => gap < shape.reach &&
    run.world.clear(eye(run.world, enemy, 1.02), eye(run.world, p, 1.02));
  enemy.recover = Math.max(0, enemy.recover - dt);
  if (enemy.windup > 0) {
    enemy.yaw += clamp(angleDelta(toward, enemy.yaw), -dt * 3.3, dt * 3.3);
    if (enemy.windup <= dt) {
      enemy.windup = 0;
      enemy.recover = enemy.kind === 'brute' ? 1.13 : .81;
      if (canReach() && Math.abs(angleDelta(toward, enemy.yaw)) < .58) hurt(run, enemy);
      emit(run, 'swing', { x: enemy.x, y: enemy.y + 1.1, z: enemy.z });
    } else enemy.windup -= dt;
    return true;
  }
  if (enemy.recover <= 0 && run.nextAttack <= run.time && canReach()) {
    enemy.windup = shape.windup;
    run.nextAttack = run.time + .33;
    emit(run, 'windup', { x: enemy.x, y: enemy.y + 1.28, z: enemy.z, kind: enemy.kind });
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
  e.yaw += clamp(angleDelta(targetAngle, e.yaw), -dt * look, dt * look);
  const isBurst = e.burst > time;
  const speed = (isBurst ? 3.48 : cfg.speed * e.pace) * (e.target ? 1 : .64) *
    (e.slow > 0 ? .54 : 1) * (e.stun > 0 ? .42 : 1) * (e.recover > .32 ? .35 : 1);
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
  e.stride = moved / dt;
  e.gait += moved * (e.kind === 'brute' ? 6.05 : e.kind === 'shrieker' ? 8.95 : 7.7);
  e.y = world.height(e.x, e.z);
}

function updateEnemies(run, dt) {
  const { player: p, world, time } = run;
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
      perception(run, e, gap);
      e.nextThink = time + (gap < 24 ? .20 : .48) + run.rng() * .08;
    }
    if (e.target?.chase) pursuing++;
    if (e.reason === 'loot flare') diverted++;
    e.stun = Math.max(0, e.stun - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.stride = 0;
    if (attack(run, e, gap, dt)) {
      if (run.status === 'dead') break;
      continue;
    }
    if (time >= e.nextVoice && gap < 24) {
      emit(run, 'voice', { id: e.id, x: e.x, y: e.y + ENEMIES[e.kind].height * .84, z: e.z, kind: e.kind, alert: Boolean(e.target) });
      e.nextVoice = time + (e.target ? 3.8 : 7) + run.rng() * 4;
    }
    if (e.kind === 'shrieker' && e.target?.chase && gap > 3.4 && gap < 13 && time > e.nextBurst && e.stun <= 0) {
      e.burst = time + .94;
      e.nextBurst = time + 4.2 + run.rng() * 1.5;
      emit(run, 'shriek', { id: e.id, kind: e.kind, x: e.x, y: e.y + 1.4, z: e.z });
    }
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
      else if (!t.chase) e.yaw += dt * .72 * e.turnSide;
    }
  }
  run.enemies = run.enemies.filter(e => !e.dead);
  run.metrics.peakPursuit = Math.max(run.metrics.peakPursuit, pursuing);
  run.metrics.peakDiversion = Math.max(run.metrics.peakDiversion, diverted);
  run.metrics.pressureSeconds += pursuing ? dt : 0;
  run.metrics.lootFlareSeconds += diverted ? dt : 0;
}

export function defaultAim(run, pitch = 0) {
  const { player: p } = run, v = direction(p.yaw);
  return { origin: { x: p.x - v.z * .18 + v.x * .34, y: p.y + p.eyeHeight - .17, z: p.z + v.x * .18 + v.z * .34 },
    ray: { x: v.x * Math.cos(pitch), y: Math.sin(pitch), z: v.z * Math.cos(pitch) } };
}

export function visibleTargets(run, soundMemory = false) {
  const p = run.player, origin = eye(run.world, p, p.eyeHeight);
  const beam = beamSettings(p);
  const visible = [];
  for (const e of run.enemies) {
    const d = distance(p, e), head = enemyPose(e).head;
    if (d < 3.8 || (p.flashlight && run.beam && inBeam(run.world, run.beam, head, beam.range, beam.angle))
      || (soundMemory && p.noisePeak > run.time && d < 11)) {
      if (run.world.clear(origin, head)) visible.push(e);
    }
  }
  return visible.sort((a, b) => distance(p, a) - distance(p, b));
}

export function stepRun(run, input = {}, dt = STEP) {
  run.events.length = 0;
  if (run.status !== 'playing') return run.events;
  const { player: p, world } = run;
  run.time += dt;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.protection = Math.max(0, p.protection - dt);
  p.yaw = input.yaw ?? p.yaw;
  p.eyeHeight = input.eyeHeight ?? p.eyeHeight;
  if (input.toggleLight && (p.flashlight || p.battery > .04)) {
    p.flashlight = !p.flashlight;
    emit(run, 'light', { on: p.flashlight });
  }
  if (input.toggleBeam) p.beam = p.beam === 'focus' ? 'wide' : 'focus';
  const runtime = 30 + p.upgrades.battery * 8;
  p.battery = clamp(p.battery + (p.flashlight ? -dt / runtime : dt / 5), 0, 1);
  if (p.flashlight && p.battery <= 1e-8) {
    p.flashlight = false;
    emit(run, 'light', { on: false, empty: true });
  }
  const mx = input.moveX || 0, mz = input.moveZ || 0, mag = Math.max(1, Math.hypot(mx, mz));
  const old = { x: p.x, z: p.z };
  const speed = input.walk ? 1.30 : 2.72;
  world.move(p, mx / mag * dt * speed, mz / mag * dt * speed, ARMS);
  if (input.roomX || input.roomZ) world.move(p, clamp(input.roomX || 0, -.36, .36), clamp(input.roomZ || 0, -.36, .36), ARMS);
  const shift = { x: p.x - old.x, y: 0, z: p.z - old.z };
  p.y = world.height(p.x, p.z);
  const shiftPose = pose => pose && { origin: { x: pose.origin.x + shift.x, y: pose.origin.y, z: pose.origin.z + shift.z }, ray: norm(pose.ray) };
  let aim = shiftPose(input.aim) || defaultAim(run, input.pitch);
  const head = eye(world, p, p.eyeHeight);
  // A real controller can pass through a wall. Resolve the shot on our side.
  if (!world.clear(head, aim.origin, false)) aim = { ...aim, origin: head };
  run.beam = shiftPose(input.lamp) || { origin: { ...head, y: head.y - .16 }, ray: aim.ray };
  if (!world.clear(head, run.beam.origin, false)) run.beam.origin = head;
  p.stepDistance += Math.hypot(shift.x, shift.z);
  if (p.stepDistance > (input.walk ? .70 : .79)) {
    p.stepDistance = 0;
    const road = world.roadDistance(p.x, p.z) < 2.9;
    const radius = (road ? 9.5 : 15) * (input.walk ? .62 : 1);
    noise(run, 'footstep', eye(world, p, .26), radius, 1.56);
    emit(run, 'footstep', { road, quiet: Boolean(input.walk) });
  }
  if (p.reload) {
    p.reload.left -= dt;
    if (p.reload.left <= 1e-8) {
      const amount = Math.min(GUNS[p.weapon].capacity - p.ammo, p.reserve);
      p.ammo += amount; p.reserve -= amount; p.reload = null;
      emit(run, 'loaded', { weapon: p.weapon });
    }
  }
  if (input.reload) startReload(run);
  if (input.fire || (input.fireHeld && p.weapon === 'smg')) shoot(run, aim);
  if (run.time - run.lastChunkCheck > .65) {
    updateLandmarks(run);
    run.lastChunkCheck = run.time;
  }
  takeLoot(run, input.interact);
  if (run.populate && run.time >= run.nextLoot) {
    majorDrop(run);
    run.nextLoot = run.time + 48 + run.rng() * 14;
  }
  if (run.populate && run.time >= run.nextSpawn) {
    const cap = Math.min(run.crowdLimit, hordeTarget(run.time));
    if (run.enemies.length < cap) {
      spawnFromCover(run, run.rng() < .64);
      if (run.enemies.length < cap - 3) spawnFromCover(run, false);
    } else {
      const facing = direction(p.yaw);
      const rear = run.enemies.find(e => distance(e, p) > (run.time > 480 ? 36 : 42) &&
        (e.x - p.x) * facing.x + (e.z - p.z) * facing.z < -16 &&
        !world.clear(head, eye(world, e)) &&
        (!p.flashlight || !inBeam(world, run.beam, eye(world, e), beamSettings(p).range, beamSettings(p).angle)));
      if (rear && spawnFromCover(run, true)) rear.dead = true;
    }
    run.nextSpawn = run.time + Math.max(.49, 1.57 - run.time / 610);
  }
  updateEnemies(run, dt);
  run.noises = run.noises.filter(n => run.time < n.born + n.span);
  run.metrics.maxCrowd = Math.max(run.metrics.maxCrowd, run.enemies.length);
  return run.events;
}
