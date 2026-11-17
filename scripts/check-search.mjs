import { createRun, enemyPose, stepRun, STEP, visibleTargets } from '../src/simulation.js';
import { CHUNK, createWorld, distance, START } from '../src/world.js';
import { DIFFICULTIES } from '../src/difficulty.js';

const seeds = ['Blackwater','Cold Creek','Reed Valley','Split Pine','Rain Line','district-path-0','district-path-2','1','2','3','4','5'];
const stride = 2;
const fullSpeed = 2.72;
const districtSize = CHUNK * 12;
const moves = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];

function walkable(world, a, b) {
  const steps = Math.max(1, Math.ceil(distance(a,b) / .45));
  for (let i = 1; i <= steps; i++) {
    if (world.blocks(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,.36)) return false;
  }
  return true;
}

function findPath(world, start, goal) {
  const initial = { ...start, i:0,j:0,cost:0, estimate:distance(start,goal) };
  const open = new Map([['0,0',initial]]), closed = new Set();
  while (open.size) {
    let best;
    for (const point of open.values()) if (!best || point.estimate < best.estimate) best = point;
    const key = best.i + ',' + best.j;
    open.delete(key);
    closed.add(key);
    if (distance(best,goal) <= stride*1.55 && walkable(world,best,goal)) {
      const path = [goal];
      for (let point = best; point.parent; point = point.parent) path.push({ x:point.x,z:point.z });
      return path.reverse();
    }
    for (const [di,dj] of moves) {
      const i = best.i+di, j = best.j+dj, near = i+','+j;
      if (closed.has(near)) continue;
      const point = { x:start.x+i*stride,z:start.z+j*stride,i,j,parent:best };
      if (point.x < Math.min(start.x,goal.x)-42 || point.x > Math.max(start.x,goal.x)+42 ||
        point.z < Math.min(start.z,goal.z)-42 || point.z > Math.max(start.z,goal.z)+42) continue;
      const verge = world.roadDistance(point.x,point.z) > 3.2;
      point.cost = best.cost + Math.hypot(di,dj)*stride*(verge ? 1.17 : 1);
      if (point.cost >= (open.get(near)?.cost ?? Infinity) || !walkable(world,best,point)) continue;
      point.estimate = point.cost + distance(point,goal);
      open.set(near,point);
    }
  }
  throw Error('No traversable path from ' + JSON.stringify(start) + ' to ' + JSON.stringify(goal));
}

function orderedSheds(sites, position) {
  const pending = sites.filter(s => s.radio), ordered = [];
  while (pending.length) {
    pending.sort((a,b)=>distance(position,a.door)-distance(position,b.door));
    const next = pending.shift();
    ordered.push(next);
    position = next.door;
  }
  return ordered;
}

function walkingSeconds(origin, path) {
  let meters = 0;
  for (const point of path) {
    meters += distance(origin,point);
    origin = point;
  }
  return meters/fullSpeed;
}

function planRoute(seed) {
  const world = createWorld(seed);
  const groups = [[0,-1],[-1,-1],[1,-1],[0,-2],[0,0]]
    .map(([i,j])=>world.districtSites(i*districtSize,j*districtSize));
  const startingBuildings = groups.shift();
  const starter = orderedSheds(startingBuildings,START);
  let end = starter.at(-1).door;
  const clusters = [starter];
  for (let i = 0; i < 2; i++) {
    groups.sort((a,b)=>Math.min(...a.filter(s=>s.radio).map(s=>distance(end,s.door))) -
      Math.min(...b.filter(s=>s.radio).map(s=>distance(end,s.door))));
    const cluster = orderedSheds(groups.shift(),end);
    clusters.push(cluster);
    end = cluster.at(-1).door;
  }
  let position = START;
  const points = [], legs = [];
  for (const site of startingBuildings) {
    const nearest = startingBuildings.filter(s=>s !== site).sort((a,b)=>distance(site.door,a.door)-distance(site.door,b.door))[0];
    legs.push({ kind:'neighbors', seconds:walkingSeconds(site.door,findPath(world,site.door,nearest.door)) });
  }
  for (const [group,cluster] of clusters.entries()) for (const [index,site] of cluster.entries()) {
    const path = findPath(world,position,site.door);
    legs.push({ kind:index ? 'searchLegs' : group ? 'betweenClusters' : 'firstShed',
      seconds:walkingSeconds(position,path) });
    position = site.door;
    const stand = site.radio.standing, corner = { x:site.inside.x,z:stand.z };
    points.push(...path,site.inside,corner,stand,corner,site.inside,site.door);
  }
  return { points, legs };
}

function simulate(seed, points, difficulty, maxSeconds) {
  const geometryOnly = difficulty === 'route';
  const run = createRun(seed,{ difficulty, populate:!geometryOnly });
  const p = run.player;
  let index = 0, first = null, nextThink = 0, threat, stalled = 0;
  while (index < points.length && run.status === 'playing' && run.time < maxSeconds) {
    while (index < points.length && distance(p,points[index]) < .18) index++;
    if (index === points.length) break;
    const target = points[index], gap = distance(p,target);
    const bearing = Math.atan2(target.x-p.x,p.z-target.z);
    if (run.time >= nextThink && !geometryOnly) {
      threat = visibleTargets(run).find(e=>distance(p,e) < 14);
      nextThink = run.time + .13;
    }
    let aim;
    const fire = threat && !threat.dead && p.ammo && !p.reload && p.cooldown < STEP;
    if (fire) {
      const at = enemyPose(threat).head;
      const origin = { x:p.x,y:p.y+p.eyeHeight-.11,z:p.z };
      aim = { origin, ray:{ x:at.x-origin.x,y:at.y-origin.y,z:at.z-origin.z } };
    }
    const x = p.x, z = p.z;
    const scale = Math.min(1,gap/(fullSpeed*STEP));
    const yaw = !geometryOnly && threat && !threat.dead ? Math.atan2(threat.x-p.x,p.z-threat.z) : bearing;
    const toggleLight = !geometryOnly && (p.flashlight ? p.battery < .10 : p.battery > .94);
    stepRun(run,{ yaw, aim, fire, toggleLight, moveX:Math.sin(bearing)*scale,moveZ:-Math.cos(bearing)*scale,
      interact:!geometryOnly && Boolean(run.offer) });
    if (run.search.sheds && first === null) first = Math.round(run.time);
    stalled = Math.hypot(x-p.x,z-p.z) < .003 ? stalled + STEP : 0;
    if (stalled > 6) break;
  }
  return { first, sheds:run.search.sheds, kills:p.kills, seconds:Math.round(run.time),
    result:run.status === 'playing' ? stalled > 6 ? 'stalled' : 'unfinished' : run.status,
    crowd:run.metrics.maxCrowd };
}

const routeOnly = process.argv.includes('--routes-only');
const maxSeconds = Number(process.argv.find(arg=>arg.startsWith('--seconds='))?.split('=')[1] ?? (routeOnly ? 1300 : 780));
if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw Error('Specify a positive number of seconds.');
const rows = [], routes = [];
for (const seed of seeds) {
  const { points, legs } = planRoute(seed);
  routes.push(...legs);
  for (const difficulty of routeOnly ? ['route'] : Object.keys(DIFFICULTIES))
    rows.push({ seed, difficulty, ...simulate(seed,points,difficulty,maxSeconds) });
  console.log('Checked',seed,'(' + routes.length + ' route legs so far)');
}
console.table(rows);
for (const kind of ['firstShed','neighbors','searchLegs','betweenClusters']) {
  const times = routes.filter(leg=>leg.kind===kind).map(leg=>leg.seconds);
  console.log(kind, Math.round(Math.min(...times)) + '–' + Math.round(Math.max(...times)) + ' s',
    times.filter(t=>t>=30 && t<=90).length + '/' + times.length + ' within 30–90 s');
}
for (const difficulty of new Set(rows.map(row=>row.difficulty))) {
  const group = rows.filter(row=>row.difficulty===difficulty);
  const first = group.map(row=>row.first).filter(t=>t!==null).sort((a,b)=>a-b);
  const median = first.length ? first[Math.floor(first.length/2)] : 'unreached';
  console.log(difficulty, 'median first shed', median, 's; total sheds', group.reduce((sum,row)=>sum+row.sheds,0),
    '; deaths', group.filter(row=>row.result==='dead').length, '; escapes', group.filter(row=>row.result==='escaped').length);
}
