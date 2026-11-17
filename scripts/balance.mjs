import { beamSettings, createRun, enemyPose, flarePower, GUNS, isSupply, magazineCapacity, stepRun, visibleTargets } from '../src/simulation.js';
import { angleDelta, clamp, direction, distance, random } from '../src/world.js';

const rules = {
  stationary: { goal: false, quiet: true, aimError: .031, shootAt: 17, flee: 0 },
  cautious: { goal: true, quiet: true, aimError: .023, shootAt: 15, flee: 5.7 },
  aggressive: { goal: true, quiet: false, aimError: .056, shootAt: 26, flee: 3.1 },
};
const kind = process.argv.find(a => a.startsWith('--strategy='))?.split('=')[1];
if (kind && !(kind in rules)) throw Error('Choose stationary, cautious, or aggressive.');
const difficulty = process.argv.find(a => a.startsWith('--difficulty='))?.split('=')[1] ?? 'standard';
if (!['standard','hard'].includes(difficulty)) throw Error('Choose standard or hard.');
const maxTime = Number(process.argv.find(a => a.startsWith('--seconds='))?.split('=')[1] ?? 540);
if (!Number.isFinite(maxTime) || maxTime <= 0 || maxTime > 3600) throw Error('Choose 1–3600 seconds.');
const seeds = process.argv.find(a => a.startsWith('--seeds='))?.split('=')[1].split(',') ??
  ['Blackwater', 'Cold Creek', 'Reed Valley', 'Split Pine', 'Rain Line'];

function angleTo(a, b) { return Math.atan2(b.x - a.x, a.z - b.z); }
function seen(run, item) {
  const p = run.player, gap = distance(p, item);
  const { range, angle } = beamSettings(p);
  return (gap < 3 || (gap < 28 && !isSupply(item.kind) && flarePower(run.time - item.born) > .13) ||
    (p.flashlight && gap < range && Math.abs(angleDelta(angleTo(p, item), p.yaw)) < angle))
    && run.world.clear({ x:p.x, y:p.y+p.eyeHeight, z:p.z }, { x:item.x, y:item.y+.4, z:item.z });
}

function navigate(world, p, bearing) {
  for (const offset of [0, .38, -.38, .75, -.75, 1.1, -1.1, 1.7, -1.7, 2.7]) {
    const v = direction(bearing + offset);
    if (!world.blocks(p.x + v.x, p.z + v.z, .44)) return v;
  }
  return { x: 0, z: 0 };
}

function play(seed, style) {
  const run = createRun(seed,{difficulty}), p = run.player, r = rules[style];
  const rng = random(seed + style + ':policy');
  let scan = -.28, audio = [], knownLoot = null, seenEnemies = [], threat = null;
  let orbit = 0, nextDecision = 0, planned = {};
  let sawEmpty = false, swaps = 0;
  while (run.status === 'playing' && run.time < maxTime) {
    if (run.time >= nextDecision) {
      nextDecision = run.time + .10;
      audio = audio.filter(e => run.time < e.until).sort((a,b) => distance(p,a) - distance(p,b)).slice(0, 7);
      seenEnemies = visibleTargets(run, true).filter(e =>
        distance(p,e) < 3.8 || Math.abs(angleDelta(angleTo(p,e), p.yaw)) < .87);
      threat = seenEnemies[0] || audio[0];
      const gap = threat ? distance(p, threat) : Infinity;
      const desired = run.loot.filter(item => !item.lost && item.kind !== 'flareAmmo' && (item.kind !== 'ammo' || p.reserve < 110)
          && (!item.kind.startsWith('armor') || Number(item.kind.at(-1)) > p.armor)
          && !Object.hasOwn(p.magazines, item.kind) && seen(run, item))
        .sort((a,b) => distance(p,a) - distance(p,b))[0];
      if (desired && r.goal) knownLoot = desired;
      if (knownLoot?.lost || (knownLoot && distance(p,knownLoot) < 1 && !run.offer)) knownLoot = null;
      let course;
      if (r.goal) {
        if (gap < r.flee) {
          const out = angleTo(p, threat) + Math.PI;
          course = navigate(run.world, p, out);
        } else if (knownLoot) course = navigate(run.world, p, angleTo(p, knownLoot));
        else {
          orbit += (rng() - .51) * .15;
          const objective = Math.cos(run.time / 54) < -.4 ? .68 : -.12;
          course = navigate(run.world, p, objective + Math.sin(orbit) * .8);
        }
      }
      const shoot = seenEnemies.find(e => distance(p,e) <= r.shootAt);
      const looking = shoot || threat || knownLoot;
      if (!looking) scan += .15 * (style === 'stationary' ? 1 : .54);
      const heading = looking ? angleTo(p, looking) : course ? Math.atan2(course.x, -course.z) + Math.sin(scan) * .42 : scan;
      const yaw = p.yaw + clamp(angleDelta(heading, p.yaw), -.66, .66);
      const fire = p.weapon !== 'flaregun' && shoot && Math.abs(angleDelta(heading,p.yaw)) < .63 && p.ammo > 0 && !p.reload && p.cooldown <= 1e-6;
      let aim;
      if (fire) {
        const pose = enemyPose(shoot), head = rng() < (style === 'aggressive' ? .43 : style === 'cautious' ? .82 : .75);
        const at = head ? pose.head : pose.torso;
        const origin = { x:p.x, y:p.y+p.eyeHeight-.11, z:p.z };
        const d = Math.max(.25, distance(origin, at));
        aim = { origin, ray: { x:(at.x-origin.x)/d+(rng()-.5)*r.aimError,
          y:(at.y-origin.y)/d+(rng()-.5)*r.aimError, z:(at.z-origin.z)/d+(rng()-.5)*r.aimError } };
      }
      const reload = !p.reload && p.reserve && p.ammo > 0 && !shoot && p.ammo < magazineCapacity(p) * .50;
      const dark = p.flashlight && (p.battery < .12 || (style === 'cautious' && !threat && p.battery < .54));
      const lit = !p.flashlight && p.battery > (gap < 8 ? .27 : .96);
      const weapons = Object.keys(p.magazines).filter(weapon => weapon !== 'flaregun');
      const next = weapons[(weapons.indexOf(p.weapon) + 1) % weapons.length];
      const anyLoaded = weapons.some(weapon => p.magazines[weapon] > 0);
      if (!anyLoaded && !p.reserve) sawEmpty = true;
      const cycleWeapon = p.weapon === 'flaregun' || weapons.length > 1 &&
        !p.ammo && (gap < 9 && p.magazines[next] > 0 || !p.reserve && anyLoaded);
      planned = { yaw, fire, aim, reload, cycleWeapon, toggleLight: dark || lit, interact: Boolean(run.offer && r.goal && !cycleWeapon),
        moveX: (course?.x || 0) * (knownLoot || gap < r.flee || !r.quiet ? 1 : .85),
        moveZ: (course?.z || 0) * (knownLoot || gap < r.flee || !r.quiet ? 1 : .85),
        walk: r.quiet && gap > r.flee };
    }
    for (const e of stepRun(run, planned)) {
      if (['voice','shriek','windup','swing'].includes(e.type) && distance(p,e) < (e.type === 'shriek' ? 19 : 12))
        audio.push({ x:e.x,z:e.z,until:run.time+2.2 });
      if (e.type === 'weaponSwitch' || e.type === 'pickup' && e.kind in GUNS) swaps++;
    }
    // One-shot intent consumed. The posture is held between decisions.
    planned = { yaw: planned.yaw, moveX: planned.moveX, moveZ: planned.moveZ, walk: planned.walk };
  }
  return {
    strategy: style, difficulty, seed, seconds: Math.round(run.time), kills: p.kills, headshots: p.headshots,
    roundsFound: run.metrics.roundsPicked, ranDry: sawEmpty, swaps,
    upgrades: run.metrics.upgrades, bestCrowd: run.metrics.maxCrowd, pursuing: run.metrics.peakPursuit,
    diverted: run.metrics.peakDiversion, ambushes: run.metrics.ambushes.emerged,
    directions: run.metrics.directionalSamples ? Number((run.metrics.coveredSectors/run.metrics.directionalSamples).toFixed(2)) : 0,
    damage: Object.entries(run.metrics.damage).map(([k,v]) => k + ':' + v).join(','),
    fatal: run.death?.kind || 'survived',
  };
}

const rows = [];
for (const seed of seeds) for (const style of kind ? [kind] : Object.keys(rules)) rows.push(play(seed, style));
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
else {
  console.table(rows);
  const median = values => values.sort((a,b) => a - b)[Math.floor(values.length / 2)];
  for (const key of kind ? [kind] : Object.keys(rules)) {
    const results = rows.filter(r => r.strategy === key);
    console.log(key + ' · median ' + median(results.map(r => r.seconds)) + 's · max ' +
      Math.max(...results.map(r => r.seconds)) + 's · ' + results.filter(r => r.ranDry).length + '/' + results.length + ' ran dry');
  }
}
