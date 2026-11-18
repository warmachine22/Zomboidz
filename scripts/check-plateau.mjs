import assert from 'node:assert/strict';
import { addEnemy, BUILD, callExtraction, createRun, enemyPose, STEP, stepRun, traceAim } from '../src/simulation.js';
import { createWorld, distance, random } from '../src/world.js';
import { findPath } from './check-search.mjs';

const world=createWorld('route-audit',{plateau:true});
const {starts,shelters,tracks,areas,props}=world.map;
const fullSpeed=2.72;
const length=(from,points)=>points.reduce((state,point)=>({at:point,meters:state.meters+distance(state.at,point)}),
  {at:from,meters:0}).meters;
const round=value=>Math.round(value*10)/10;
const summary=values=>({min:round(Math.min(...values)),mean:round(values.reduce((a,b)=>a+b)/values.length),max:round(Math.max(...values))});
const paths=new Map();
const path=(from,to,step=2)=>{
  const key=[from.x,from.z,to.x,to.z,step].join(',');
  if (!paths.has(key)) paths.set(key,findPath(world,from,to,step));
  return paths.get(key);
};

function walk(run,points) {
  const p=run.player;
  for (const point of points) {
    let stuck=0;
    while (distance(p,point)>.105 && run.status==='playing') {
      const dx=point.x-p.x, dz=point.z-p.z, gap=Math.hypot(dx,dz);
      const factor=1/Math.max(gap,fullSpeed*STEP);
      const x=p.x,z=p.z;
      stepRun(run,{moveX:dx*factor,moveZ:dz*factor,yaw:Math.atan2(dx,-dz)});
      stuck=distance(p,{x,z})<.002?stuck+1:0;
      assert.ok(stuck<20,'Blocked near '+JSON.stringify(point));
    }
  }
}

function routes() {
  const interior=new Map(), arrivals=[], nextShelter=[];
  for (const site of shelters) {
    assert.ok(!world.blocks(site.door.x,site.door.z,.36),site.name+' door');
    assert.ok(!world.blocks(site.innerGuard.x,site.innerGuard.z,.36),site.name+' indoor guard');
    const points=[...path(site.door,site.ammo,.6),...path(site.ammo,site.part,.6),
      ...path(site.part,site.gear,.6),...path(site.gear,site.door,.6)];
    interior.set(site.id,points);
    const next=shelters.filter(other=>other!==site)
      .sort((a,b)=>distance(a.door,site.door)-distance(b.door,site.door))[0];
    nextShelter.push(length(site.door,path(site.door,next.door))/fullSpeed);
  }
  for (const start of starts) {
    assert.ok(!world.blocks(start.x,start.z,.36),'safe start');
    const near=shelters.reduce((a,b)=>distance(start,a.door)<distance(start,b.door)?a:b);
    arrivals.push(length(start,path(start,near.door))/fullSpeed);
  }
  for (const [x,z,ex,ez] of tracks.slice(0,-shelters.length)) path({x,z},{x:ex,z:ez});
  assert.ok(world.blocks(.5,200) && world.height(-10,200)<world.height(2,200)-7);
  for (const area of new Set(shelters.map(s=>s.zone))) {
    const run=createRun('audit-region-'+area,{crafted:true,populate:false});
    for (const site of shelters.filter(s=>s.zone===area)) {
      Object.assign(run.player,site.door,{y:world.height(site.door.x,site.door.z)});
      walk(run,interior.get(site.id));
      assert.ok(run.campaign.visited.has(site.id),site.name+' visited');
    }
  }
  const hunt=[];
  for (let i=0;i<12;i++) {
    const run=createRun('audit-extraction-'+i,{crafted:true,populate:false});
    const pending=[...shelters];
    let at=run.campaign.start, approach=0, count=0;
    const partShelters=new Set(run.campaign.caches.filter(cache=>cache.part!==undefined).map(cache=>cache.site.id));
    const walkRun=i===0;
    while (partShelters.size) {
      pending.sort((a,b)=>distance(at,a.door)-distance(at,b.door));
      const site=pending.shift(), route=path(at,site.door);
      approach+=length(at,route)+length(site.door,interior.get(site.id));
      at=site.door;
      count++;
      if (walkRun) walk(run,[...route,...interior.get(site.id)]);
      partShelters.delete(site.id);
    }
    if (walkRun) {
      assert.equal(run.campaign.parts.size,5);
      assert.ok(callExtraction(run));
      assert.equal(run.status,'escaped');
    }
    hunt.push({shelters:count,seconds:approach/fullSpeed,walked:walkRun?run.time:null});
  }
  return { zones:areas.length, shelters:shelters.length, starts:starts.length, rooms:shelters.map(s=>s.rooms),
    wrecks:props.filter(p=>p.kind==='wreck').length,camps:props.filter(p=>p.kind==='camp').length,
    firstShelterSeconds:summary(arrivals), neighborSeconds:summary(nextShelter),
    noZombieHunt:{sheds:summary(hunt.map(r=>r.shelters)),seconds:summary(hunt.map(r=>r.seconds)),walkedSeconds:round(hunt[0].walked)} };
}

function encounter(seed,crafted,quiet) {
  const run=createRun(seed,{crafted:true,populate:false});
  if (!crafted) run.campaign=null;
  const site=shelters[2];
  const dx=site.junction.x-site.door.x,dz=site.junction.z-site.door.z,d=Math.hypot(dx,dz);
  const start={x:site.door.x+dx/d*22,z:site.door.z+dz/d*22};
  const waypoints=[...path(start,site.door,.8),...path(site.door,site.ammo,.6)];
  const {player:p,world}=run;
  Object.assign(p,start,{y:world.height(start.x,start.z),armor:1,yaw:Math.PI});
  run.loot.length=0;
  const kinds=['shambler','shrieker','shambler','brute','shambler','shrieker','shambler','shambler','shambler','shambler'];
  const baseAngle=random(seed+':approach')()*6;
  for (let i=0;i<(crafted?4:10);i++) {
    const base=i*2.399+baseAngle;
    let position=null;
    for (let attempt=0;attempt<20;attempt++) {
      const t=base+.17*attempt, radius=4+i%4+attempt*.19;
      const at={x:p.x+Math.cos(t)*radius,z:p.z+Math.sin(t)*radius};
      if (!world.blocks(at.x,at.z,.4) && run.enemies.every(e=>distance(e,at)>1)) {position=at;break;}
    }
    assert.ok(position,'valid benchmark enemy');
    const e=addEnemy(run,kinds[i],position.x,position.z);
    e.home=position;
  }
  const seen=()=>run.enemies.filter(e=>!e.dead && distance(p,e)<15).sort((a,b)=>distance(p,a)-distance(p,b));
  let waypoint=0, first=null, pausedFor=0;
  while (run.time<45 && run.status==='playing' && waypoint<waypoints.length) {
    while (distance(p,waypoints[waypoint])<.10) {
      waypoint++;
      if (waypoint===waypoints.length) break;
    }
    if (waypoint===waypoints.length) break;
    let aim,fire=false;
    const visible=seen();
    for (const enemy of visible) {
      if (p.reload || p.cooldown>STEP || !p.ammo) break;
      const at=enemyPose(enemy).head, origin={x:p.x,y:p.y+1.47,z:p.z};
      const shot={origin,ray:{x:at.x-origin.x,y:at.y-origin.y,z:at.z-origin.z}};
      const trace=traceAim(run,shot);
      if (trace?.e!==enemy || trace.zone!=='head') continue;
      aim=shot; fire=true; break;
    }
    const target=waypoints[waypoint];
    const dx=target.x-p.x,dz=target.z-p.z,gap=Math.hypot(dx,dz);
    const hold=quiet && (fire || (p.reload && visible.some(e=>distance(p,e)<7))) && pausedFor<12;
    if (hold) pausedFor+=STEP;
    const factor=hold?0:1/Math.max(gap,(quiet?1.3:fullSpeed)*STEP);
    stepRun(run,{fire,aim,walk:quiet,yaw:Math.atan2(dx,-dz),moveX:dx*factor,moveZ:dz*factor});
    if (first===null && distance(p,site.door)<.45) first=round(run.time);
  }
  return {seed,strategy:quiet?'cautious':'moving',version:crafted?BUILD:'Classic',hostiles:crafted?4:10,
    shots:run.metrics.shots,roundsLeft:p.ammo+p.reserve,armorSpent:Math.max(0,1-p.armor),
    kills:p.kills,firstDoor:first,seconds:round(run.time),
    result:run.status==='dead'?'dead':waypoint===waypoints.length?'reached':'timed out'};
}

if (!process.argv.includes('--combat-only')) console.log(JSON.stringify(routes(),null,2));
if (!process.argv.includes('--routes-only'))
  console.table(Array.from({length:6},(_,i)=>[false,true].flatMap(quiet=>
    [false,true].map(crafted=>encounter('paired-'+i,crafted,quiet)))).flat());
