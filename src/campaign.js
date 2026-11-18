import { angleDelta, clamp, direction, distance, random } from './world.js';
import { difficultyKey } from './difficulty.js';

export const RADIO_PARTS = ['Transceiver', 'Power pack', 'Antenna', 'Handset', 'Frequency module'];
export const SPECIES = ['shambler','shrieker','brute'];
const presets = {
  easy: {population:90, active:8, sight:6, speeds:[1.95,2.85,1.55]},
  standard: {population:125, active:10, sight:8, speeds:[2.2,3.1,1.8]},
  hard: {population:150, active:12, sight:10, speeds:[2.4,3.35,2]},
};
const hits = [[3,5],[2,4],[6,10]];
export const TUNING_FIELDS = {
  head: {label:'Head hits',min:2,max:24,step:1},
  body: {label:'Torso hits',min:2,max:32,step:1},
  speed: {label:'Chase speed (m/s)',min:.5,max:4,step:.05},
};

export function defaultTuning(difficulty) {
  const preset = presets[difficultyKey(difficulty)];
  return { population:preset.population, enemies:Object.fromEntries(SPECIES.map((key,i)=>
    [key,{head:hits[i][0],body:hits[i][1],speed:preset.speeds[i]}])) };
}

export function normalizeTuning(difficulty, source) {
  const result = defaultTuning(difficulty);
  if (Number.isFinite(source?.population)) result.population = Math.round(clamp(source.population,0,150));
  for (const kind of SPECIES) for (const [key,field] of Object.entries(TUNING_FIELDS)) {
    const value = source?.enemies?.[kind]?.[key];
    if (Number.isFinite(value)) result.enemies[kind][key] = Number((Math.round(clamp(value,field.min,field.max)/field.step)*field.step).toFixed(2));
  }
  return result;
}

function shuffled(items, rng) {
  const result = [...items];
  for (let i=result.length-1; i>0; i--) {
    const j=Math.floor(rng()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}

export function createCampaign(seed, world, difficulty, source, populate) {
  const tuning = normalizeTuning(difficulty,source), preset = presets[difficulty];
  const map = world.map, rng = random(seed+':plateau-run');
  const start = map.starts[Math.floor(rng()*map.starts.length)];
  const parts = new Map(shuffled(map.shelters,rng).slice(0,5).map((s,i)=>[s.id,i]));
  const gear = shuffled(['damage','damage','damage','pierce','pierce','reload','reload','reload',
    'battery','battery','battery','lens','lens','lens','capacity','capacity','capacity',
    'shotgun','smg','carbine','armor1','armor1','armor2','armor2','armor3'],rng);
  const caches = map.shelters.map((site,i)=>({site,gear:gear[i],part:parts.get(site.id)}));
  const guards = map.residents.slice(0,25);
  const extra = difficulty==='easy' ? 8 : 15;
  const sites = [...guards,...map.residents.slice(25,25+extra),
    ...shuffled(map.residents.slice(40),rng),
    ...map.residents.slice(25+extra,40)];
  const residents = populate ? sites.slice(0,tuning.population).map(site=>({site,enemy:null})) : [];
  return { start, tuning, ranked:JSON.stringify(tuning)===JSON.stringify(defaultTuning(difficulty)),
    active:preset.active, sight:preset.sight, residents, caches, parts:new Set(), visited:new Set(), nextCheck:0 };
}

export function insideShelter(point, site) {
  return Math.abs(point.x-site.x)<site.w/2-.28 && Math.abs(point.z-site.z)<site.d/2-.32;
}

export function shelterRoute(world, enemy, destination) {
  const site = world.map.shelters.find(s=>insideShelter(enemy,s) || insideShelter(destination,s) ||
    distance(enemy,s.door)<1.4 || distance(destination,s.door)<1.4);
  if (!site) return destination;
  const a={x:enemy.x,y:enemy.y+.55,z:enemy.z};
  const b={...destination,y:world.height(destination.x,destination.z)+.55};
  if (world.clear(a,b,false)) return destination;
  const local = p => ({x:(p.x-site.x)*site.sign,z:(p.z-site.z)*site.sign});
  const from = local(enemy), to = local(destination);
  const worldPoint = (x,z) => ({x:site.x+x*site.sign,z:site.z+z*site.sign});
  const room = (p,local) => !insideShelter(p,site) ? 0 : local.z<=0 ? 1 : site.rooms===3 && local.x>.15 ? 3 : 2;
  const start=room(enemy,from), end=room(destination,to);
  const points=[
    [site.door,worldPoint(0,-site.d/2+.7)],
    [worldPoint(-site.w*.19,-.65),worldPoint(-site.w*.19,.65)],
    [worldPoint(-.55,site.d*.30),worldPoint(.85,site.d*.30)],
  ];
  if (start!==end) {
    const ascending=start<end;
    const [near,far]=points[ascending?start:start-1];
    const first=ascending?near:far, second=ascending?far:near;
    return distance(enemy,first)<.47?second:first;
  }
  return destination;
}

export function syncResidents(run, addEnemy, cap) {
  const {time,player,world,campaign} = run;
  if (time < campaign.nextCheck) return;
  campaign.nextCheck = time+.25;
  const active = new Set(run.enemies);
  const candidates = campaign.residents.filter(r=>!r.enemy?.dead &&
    distance(r.enemy??r.site,player)<(active.has(r.enemy)?48:34));
  // Actors already in a fight or close enough to observe keep their slot.
  const priority = r => {
    const e = r.enemy??r.site, gap=distance(e,player);
    return gap - (active.has(r.enemy) ? (r.enemy.target?.chase || gap<17 ? 100 : 5) : 0);
  };
  candidates.sort((a,b)=>priority(a)-priority(b));
  const selected = new Set(candidates.slice(0,cap));
  run.enemies = run.enemies.filter(e=>!e.resident || (!e.dead && selected.has(e.resident)));
  for (const record of selected) {
    if (active.has(record.enemy) || run.enemies.length>=cap) continue;
    if (record.enemy) {
      const {x,y,z,yaw}=record.enemy;
      Object.assign(record.enemy.previousTransform,{x,y,z,yaw});
      record.enemy.nextThink=time;
      run.enemies.push(record.enemy);
      continue;
    }
    const site = record.site;
    const tree = site.hide && !site.shelter && world.around(site.x,site.z,5).flatMap(c=>c.trees)
      .filter(t=>t.r>.30 && distance(t,site)<5).sort((a,b)=>distance(site,a)-distance(site,b))[0];
    const coverSide = tree && direction(Math.atan2(tree.x-site.approach.x,site.approach.z-tree.z));
    const behind = tree && {x:tree.x+coverSide.x*(tree.r+.63),z:tree.z+coverSide.z*(tree.r+.63)};
    const position = [behind,site,...[.85,1.6,2.4].flatMap(radius=>Array.from({length:8},(_,i)=>({
      x:site.x+Math.cos(i*Math.PI/4)*radius,z:site.z+Math.sin(i*Math.PI/4)*radius,
    })))].find(at=>at && !world.blocks(at.x,at.z,.38) && distance(at,player)>4 &&
      !run.enemies.some(e=>distance(e,at)<1));
    if (!position) continue;
    const e = addEnemy(run,site.kind,position.x,position.z);
    e.yaw=e.previousTransform.yaw=behind===position ?
      Math.atan2(site.approach.x-e.x,e.z-site.approach.z)+.62 : site.yaw;
    Object.defineProperty(e,'resident',{value:record});
    e.home=position;
    e.hiding=site.hide;
    e.patrolAt=time+3+e.voiceVariation*5;
    record.enemy=e;
  }
}

export function residentPerception(run, e, gap, lamps = []) {
  const {world,player:p,time,campaign} = run;
  if (e.reactionUntil>time) return;
  const origin = {x:e.x,y:e.y+1.34,z:e.z};
  const head = {x:p.x,y:p.y+p.eyeHeight*.85,z:p.z};
  const yaw = Math.atan2(p.x-e.x,e.z-p.z);
  let best = null;
  const offer = (at,reason,score,id,chase) => {
    if (!best || best.score<score) best={x:at.x,z:at.z,reason,score,id,chase};
  };
  const aware=e.alertUntil>time;
  if (gap<(aware?campaign.sight+2:campaign.sight) &&
      (gap<.9 || Math.abs(angleDelta(yaw,e.yaw))<Math.PI/3) && world.clear(origin,head))
    offer(p,'saw player',gap<2.3?5:2,'player',true);
  if (gap<campaign.sight+4 && gap>.05 && Math.abs(angleDelta(yaw,e.yaw))<Math.PI/2) for (const lamp of lamps) {
    const dx=origin.x-lamp.origin.x,dy=origin.y-lamp.origin.y,dz=origin.z-lamp.origin.z;
    const d=Math.hypot(dx,dy,dz);
    if (d<lamp.range && d>.03 && (dx*lamp.ray.x+dy*lamp.ray.y+dz*lamp.ray.z)/d>Math.cos(lamp.angle)
        && world.clear(lamp.origin,origin)) offer(p,'flashlight',1.3,'player',true);
  }
  for (const n of run.noises) {
    if (n.born<=(e.heardAt??-Infinity) || time>n.born+n.span) continue;
    const d=distance(e,n.origin);
    if (d>=n.radius) continue;
    const range=n.radius*(world.clear(origin,n.origin,false)?1:n.kind==='gunshot'?.48:.40);
    if (d<range) offer(n.origin,n.kind,(n.kind==='gunshot'?1.4:1.05)*(1-d/range),n.kind,true);
  }
  const guard=run.guards?.get(e.id);
  if (guard && gap>2.8) offer(guard,guard.reason,1.6*guard.power,guard.id,false);
  if (best?.chase) {
    if (!aware && e.hiding && gap<5.3) e.leapUntil=time+2.4;
    e.alertUntil=time+8;
    e.memory={...best};
    if (best.id!=='player') e.heardAt=time;
  }
  if (!best && e.alertUntil>time && e.memory) best={...e.memory,reason:'last '+e.memory.reason};
  if (!best && !e.patrolling && e.home && distance(e,e.home)>1) {
    offer(e.home,'returning to post',.1,'home',false);
  }
  if (e.reason!==best?.reason) e.changedAt=time;
  e.reason=best?.reason??(e.hiding?'holding cover':'patrol');
  e.target=best;
}

export function rearHit(enemy, origin) {
  const facing=direction(enemy.yaw), gap=distance(enemy,origin);
  return gap>.05 && ((origin.x-enemy.x)*facing.x+(origin.z-enemy.z)*facing.z)/gap<-.5;
}
