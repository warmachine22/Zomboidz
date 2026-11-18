import { angleDelta, CHUNK, clamp, direction, distance, random } from './world.js';
import { difficultyKey } from './difficulty.js';
import { PLATEAU } from './plateau.js';
import { LARGE_TREE_COUNT, TREE_POSTS } from './tree-posts.js';

export const RADIO_PARTS = ['Transceiver', 'Power pack', 'Antenna', 'Handset', 'Frequency module'];
export const SPECIES = ['shambler','shrieker','brute'];
const presets = {
  easy: {treeShare:.20, outsideGuards:1, active:8, sight:6, speeds:[1.95,2.85,1.55]},
  standard: {treeShare:.30, outsideGuards:2, active:10, sight:8, speeds:[2.2,3.1,1.8]},
  hard: {treeShare:.35, outsideGuards:3, active:12, sight:10, speeds:[2.4,3.35,2]},
};
const hits = [[3,5],[2,4],[6,10]];
const shelterCount=PLATEAU.shelters.length, shelterRooms=PLATEAU.shelters.reduce((sum,shelter)=>sum+shelter.rooms,0);
export const MAX_RESIDENTS=800;
export const TUNING_FIELDS = {
  head: {label:'Head hits',min:2,max:24,step:1},
  body: {label:'Torso hits',min:2,max:32,step:1},
  speed: {label:'Chase speed (m/s)',min:.5,max:4,step:.05},
};

export function defaultTuning(difficulty) {
  const preset = presets[difficultyKey(difficulty)];
  const population=shelterRooms+shelterCount*preset.outsideGuards+Math.round(preset.treeShare*LARGE_TREE_COUNT);
  return { population, enemies:Object.fromEntries(SPECIES.map((key,i)=>
    [key,{head:hits[i][0],body:hits[i][1],speed:preset.speeds[i]}])) };
}

export function normalizeTuning(difficulty, source) {
  const result = defaultTuning(difficulty);
  if (Number.isFinite(source?.population)) result.population = Math.round(clamp(source.population,0,MAX_RESIDENTS));
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

const tileKey=(x,z)=>Math.floor(x/CHUNK)+','+Math.floor(z/CHUNK);

function shelterGuardSites(map,preset) {
  const guards=[];
  const local=[.30,-.24,-.34,.21,.32,.37,-.73,-.23,.67,.64,.68,-.61];
  // Visit the same room across all shelters before adding another tier of guards.
  for (let i=0;i<3+preset.outsideGuards;i++) for (const shelter of map.shelters) {
    const {x,z,w,d,sign,rooms,id}=shelter;
    if (i===2 && rooms<3) continue;
    const point={x:x+local[i*2]*w*sign,z:z+local[i*2+1]*d*sign};
    const at=i<3 ? {x:x+(i===1?-.17:.16)*w*sign,z:point.z} : {x:x+local[i*2]*w*sign,z:point.z+2.4*sign};
    guards.push({...point,id:id+':guard:'+i,shelter,room:i<3?i:null,hide:i!==1,
      kind:i===2 && shelter.palette%2===0?'brute':(i+shelter.zone)%5===4?'shrieker':'shambler',
      yaw:Math.atan2(shelter.door.x-point.x,point.z-shelter.door.z),patrol:[point,at]});
  }
  return guards;
}

function residentSites(seed,map,preset,population) {
  const guards=shelterGuardSites(map,preset);
  const rng=random(seed+':tree-posts'), available=shuffled(TREE_POSTS,rng), earmarked=new Set();
  const count=Math.max(0,population-guards.length);
  function selectNear(x,z,amount,limit) {
    const candidates=available.filter(post=>!earmarked.has(post) && Math.hypot(x-post[1],z-post[2])<limit)
      .sort((a,b)=>Math.hypot(x-a[1],z-a[2])-Math.hypot(x-b[1],z-b[2])).slice(0,amount+2);
    for (const post of shuffled(candidates,rng).slice(0,amount)) earmarked.add(post);
  }
  if (count>=48) for (const start of map.starts) selectNear(start.x,start.z,2,34);
  if (count>=180) for (const [x,z,ex,ez] of map.tracks.slice(0,-map.shelters.length)) {
    const divisions=Math.ceil(Math.hypot(x-ex,z-ez)/42);
    for (let i=0;i<divisions;i++) {
      const t=(i+.5)/divisions;
      selectNear(x+(ex-x)*t,z+(ez-z)*t,1,23);
    }
  }
  const treeline=[...earmarked,...available.filter(post=>!earmarked.has(post))].slice(0,count);
  const trees=treeline.map(([key,x,z,tx,tz,r],i)=>({
    id:'tree:'+key,x,z,tree:{x:tx,z:tz,r},hide:true,
    yaw:Math.atan2(tx-x,z-tz),kind:i%19===18?'brute':i%4===3?'shrieker':'shambler',
  }));
  return [...guards,...trees].slice(0,population);
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
  const residents=populate?residentSites(seed,map,preset,tuning.population).map(site=>({site,enemy:null})):[];
  const residentIndex=new Map();
  for (const record of residents) {
    const key=tileKey(record.site.x,record.site.z);
    if (!residentIndex.has(key)) residentIndex.set(key,[]);
    residentIndex.get(key).push(record);
  }
  return { start, tuning, ranked:JSON.stringify(tuning)===JSON.stringify(defaultTuning(difficulty)),
    active:preset.active,sight:preset.sight,residents,residentIndex,caches,parts:new Set(),visited:new Set(),nextCheck:0,nextTactics:0 };
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
  const nearby=new Set(run.enemies.filter(e=>e.resident).map(e=>e.resident));
  for (let z=Math.floor((player.z-34)/CHUNK);z<=Math.floor((player.z+34)/CHUNK);z++)
    for (let x=Math.floor((player.x-34)/CHUNK);x<=Math.floor((player.x+34)/CHUNK);x++)
      for (const record of campaign.residentIndex.get(x+','+z)??[]) nearby.add(record);
  const candidates=[...nearby].filter(r=>!r.enemy?.dead &&
    distance(r.enemy??r.site,player)<(active.has(r.enemy)?48:34));
  // Actors already in a fight or close enough to observe keep their slot.
  const priority = r => {
    const e = r.enemy??r.site, gap=distance(e,player);
    const post=r.site.shelter;
    const guarding=post && distance(player,post)<19 ? 12 : 0;
    const alreadyHere=active.has(r.enemy);
    const fighting=alreadyHere && (r.enemy.attackAge!==undefined || r.enemy.target?.chase && gap<24);
    return gap - guarding - (fighting ? 45 : alreadyHere ? (gap<13?12:3) : 0);
  };
  candidates.sort((a,b)=>priority(a)-priority(b));
  const selected = new Set(candidates.slice(0,cap));
  run.enemies=run.enemies.filter(e=>{
    if (!e.resident || selected.has(e.resident)) return !e.dead;
    if (!e.dead) {
      const {x,z}=e.home;
      Object.assign(e,{x,z,y:world.height(x,z),yaw:e.resident.site.yaw,target:null,memory:null,alertUntil:0,
        attackAge:undefined,windup:0,recover:0,stride:0,moveSpeed:0,turnRate:0,burstStart:0,burst:0,brakeUntil:0,
        warningUntil:0,rushUntil:0,attackAfter:0,ambushSpent:false,flankRole:0,coveredRoute:null,patrolling:false,search:null});
    }
    return false;
  });
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
    const options=site.tree ? [site] : [site,...[.75,1.4,2.2].flatMap(radius=>Array.from({length:8},(_,i)=>({
      x:site.x+Math.cos(i*Math.PI/4)*radius,z:site.z+Math.sin(i*Math.PI/4)*radius,
    })))];
    const position=options.find(at=>!world.blocks(at.x,at.z,.36) &&
      (site.room===null || !site.shelter || insideShelter(at,site.shelter)) &&
      distance(at,player)>(site.shelter?1.6:2.45) &&
      !run.enemies.some(e=>distance(e,at)<1));
    if (!position) continue;
    const e = addEnemy(run,site.kind,position.x,position.z);
    e.yaw=e.previousTransform.yaw=site.yaw;
    Object.defineProperty(e,'resident',{value:record});
    e.home=position;
    e.hiding=site.hide;
    e.patrolAt=time+3+e.voiceVariation*5;
    record.enemy=e;
  }
}

function seePastTree(run,e,head,gap) {
  const tree=e.resident?.site.tree;
  if (!tree || gap>6 || e.target?.chase || distance(e,e.home)>.6) return false;
  const dx=e.x-tree.x,dz=e.z-tree.z,length=Math.hypot(dx,dz);
  const side=Math.sign((head.x-tree.x)*-dz+(head.z-tree.z)*dx);
  if (!side) return false;
  const lean=.69*side/length;
  const eye={x:e.x-dz*lean,y:e.y+1.22,z:e.z+dx*lean};
  return run.world.clear(eye,head);
}

export function residentPerception(run, e, gap, lamps = []) {
  const {world,player:p,time,campaign} = run;
  if (e.reactionUntil>time) return;
  const origin = {x:e.x,y:e.y+1.34,z:e.z};
  const head = {x:p.x,y:p.y+p.eyeHeight*.85,z:p.z};
  const yaw = Math.atan2(p.x-e.x,e.z-p.z);
  let best = null;
  const offer = (at,reason,score,id,chase) => {
    if (!best || best.score<score) best={x:at.x,z:at.z,reason,score,id,chase,
      ...(id==='player' ? {vx:p.travelX,vz:p.travelZ} : {})};
  };
  const aware=e.alertUntil>time;
  const post=e.resident?.site;
  const holdingBackRoom=post?.room>0 && !aware && insideShelter(e,post.shelter);
  const sees=gap<(aware?campaign.sight+2:campaign.sight) &&
    (gap<.9 || Math.abs(angleDelta(yaw,e.yaw))<Math.PI/3) && world.clear(origin,head);
  const peeks=!sees && seePastTree(run,e,head,gap);
  if (sees || peeks)
    offer(p,'saw player',gap<2.3?5:2,'player',true);
  if (gap<campaign.sight+4 && gap>.05 && Math.abs(angleDelta(yaw,e.yaw))<Math.PI/2) for (const lamp of lamps) {
    const dx=origin.x-lamp.origin.x,dy=origin.y-lamp.origin.y,dz=origin.z-lamp.origin.z;
    const d=Math.hypot(dx,dy,dz);
    if (d<lamp.range && d>.03 && (dx*lamp.ray.x+dy*lamp.ray.y+dz*lamp.ray.z)/d>Math.cos(lamp.angle)
        && world.clear(lamp.origin,origin)) offer(p,'flashlight',1.3,'player',true);
  }
  for (const n of run.noises) {
    if (n.born<=(e.heardAt??-Infinity) || time>n.born+n.span) continue;
    if (n.kind==='footstep' && e.resident?.site.tree && !aware) continue;
    if (holdingBackRoom && !insideShelter(n.report??n.origin,post.shelter)) continue;
    const d=distance(e,n.origin);
    if (d>=n.radius) continue;
    const range=n.radius*(world.clear(origin,n.origin,false)?1:n.kind==='gunshot'?.55:.45);
    if (d<range) {
      const strength=n.kind==='gunshot'?1.4:n.kind==='zombie call'?.82:1.05;
      offer(n.report??n.origin,n.kind,strength*(1-d/range),n.kind,true);
    }
  }
  const guard=run.guards?.get(e.id);
  if (guard && gap>2.8) offer(guard,guard.reason,1.6*guard.power,guard.id,false);
  let warned=false;
  if (best?.chase) {
    const passed=gap<5.6 && Math.cos(angleDelta(yaw,p.yaw))>.05;
    if (e.hiding && !e.ambushSpent && best.id==='player' && gap<6 &&
        ((e.resident?.site.tree && (passed || peeks)) || (e.resident?.site.shelter && !aware))) {
      e.ambushSpent=true;
      e.warningUntil=time+.34;
      e.attackAfter=time+1.10;
      e.rushUntil=time+6;
      e.leapUntil=e.rushUntil;
      warned=true;
    }
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
  if (!best && e.home && distance(e,e.home)<1) e.ambushSpent=false;
  return warned;
}

export function rearHit(enemy, origin) {
  const facing=direction(enemy.yaw), gap=distance(enemy,origin);
  return gap>.05 && ((origin.x-enemy.x)*facing.x+(origin.z-enemy.z)*facing.z)/gap<-.5;
}
