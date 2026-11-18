import test from 'node:test';
import assert from 'node:assert/strict';
import { addEnemy, callExtraction, createRun, enemyPose, GUNS, shoot, STEP, stepRun, traceAim, UPGRADES } from '../src/simulation.js';
import { defaultTuning } from '../src/campaign.js';
import { activeHordeLimit } from '../src/difficulty.js';
import { distance } from '../src/world.js';
import { listScores, recordRun } from '../src/records.js';

function focusRoom(seed='plateau-room', options={}) {
  const run=createRun(seed,{crafted:true,populate:false,...options});
  Object.assign(run.world,{height:()=>0,blocks:()=>false,clear:()=>true,raycast:()=>null});
  Object.assign(run.player,{x:330,y:0,z:281,flashlight:false});
  return run;
}

const aimFrom=(origin,at)=>({origin,ray:{x:at.x-origin.x,y:at.y-origin.y,z:at.z-origin.z}});

test('plateau presets have a fixed population and a device-limited nearby crowd',()=>{
  for (const [difficulty,residents,cap] of [['easy',90,8],['standard',125,10],['hard',150,12]]) {
    const run=createRun('population',{difficulty,crafted:true});
    assert.equal(run.campaign.residents.length,residents);
    const indoor=run.world.map.residents.slice(0,25);
    assert.ok(indoor.every(site=>run.campaign.residents.some(record=>record.site===site)));
    assert.ok(run.enemies.length<=cap);
    assert.equal(activeHordeLimit(run),cap);
    run.time=1800;
    assert.equal(activeHordeLimit(run),cap);
    run.crowdLimit=5;
    assert.equal(activeHordeLimit(run),5);
  }
});

test('a seed fixes the start, resident distribution and all five different parts',()=>{
  const run=createRun('plateau-replay',{crafted:true}), same=createRun(run.seed,{crafted:true,populate:false});
  assert.deepEqual(run.campaign.start,same.campaign.start);
  assert.deepEqual(run.campaign.caches,same.campaign.caches);
  assert.equal(run.campaign.caches.length,25);
  assert.notDeepEqual(createRun('different',{crafted:true,populate:false}).campaign.caches,same.campaign.caches);
  const parts=run.campaign.caches.filter(cache=>cache.part!==undefined);
  assert.deepEqual(new Set(parts.map(cache=>cache.part)),new Set([0,1,2,3,4]));
  assert.equal(new Set(parts.map(cache=>cache.site.id)).size,5);
  for (const [kind,upgrade] of Object.entries(UPGRADES))
    assert.equal(run.campaign.caches.filter(cache=>cache.gear===kind).length,upgrade.cap);
});

test('plateau caches persist after leaving a tile and only the complete radio can extract',()=>{
  const run=createRun('live-extraction',{crafted:true,populate:false});
  assert.equal(callExtraction(run),false);
  function stepAt(position) {
    Object.assign(run.player,position);
    run.lastChunkCheck=-Infinity;
    stepRun(run);
  }
  const parts=run.campaign.caches.filter(cache=>cache.part!==undefined);
  for (const {site,part} of parts) {
    stepAt(site.part);
    assert.ok(run.campaign.visited.has(site.id));
    assert.ok(run.campaign.parts.has(part));
    assert.ok(run.settledLoot.has(site.id+':part'));
  }
  assert.equal(run.campaign.visited.size,5);
  stepAt(run.world.map.starts.at(-1));
  stepAt(parts[0].site.part);
  assert.equal(run.loot.some(loot=>loot.id===parts[0].site.id+':part'&&!loot.lost),false);
  assert.equal(run.campaign.parts.size,5);
  assert.equal(run.status,'playing');
  const elapsed=run.time;
  assert.equal(callExtraction(run),true);
  assert.equal(run.status,'escaped');
  assert.equal(run.time,elapsed);
  assert.equal(run.events.at(-1).type,'extraction');
  assert.equal(callExtraction(run),false);
});

test('base pistol kill counts agree with visible hit zones and exact impact points',()=>{
  for (const [kind,head,body] of [['shambler',3,5],['shrieker',2,4],['brute',6,10]]) {
    for (const [zone,count] of [['head',head],['torso',body]]) {
      const run=focusRoom(), p=run.player;
      const e=addEnemy(run,kind,p.x,p.z-7);
      for (let shot=1;shot<=count;shot++) {
        const at=enemyPose(e)[zone], aim=aimFrom({...at,z:p.z},at);
        p.cooldown=0; p.ammo=6;
        const trace=traceAim(run,aim);
        assert.equal(trace.zone,zone==='torso'?'body':zone);
        shoot(run,aim);
        const {x,y,z,enemyId}=run.events.filter(e=>e.type==='impact').at(-1);
        assert.deepEqual({x,y,z},trace.point);
        assert.equal(enemyId,e.id);
        assert.equal(Boolean(e.dead),shot===count,kind+' '+zone+' '+shot);
      }
    }
  }
});

test('one upgraded shotgun trigger pull always leaves a fresh enemy alive',()=>{
  for (const kind of ['shambler','shrieker','brute']) {
    const run=focusRoom(), p=run.player;
    p.weapon='shotgun';p.magazines.shotgun=GUNS.shotgun.capacities[3];p.upgrades.damage=3;
    const e=addEnemy(run,kind,p.x,p.z-2), at=enemyPose(e).head;
    shoot(run,aimFrom({...at,z:p.z},at));
    assert.ok(e.hp>=e.maxHp*.449 && e.hp<e.maxHp);
  }
});

test('quietly reaching the rear stays unseen and the first hit buys a fixed reaction window',()=>{
  const run=focusRoom(), p=run.player;
  const e=addEnemy(run,'brute',p.x,p.z-5);
  e.yaw=0;e.hiding=true;e.nextThink=0;
  for (let i=0;i<34;i++) stepRun(run,{moveZ:-1,walk:true});
  assert.equal(e.target,null);
  const fire=()=>{
    const head=enemyPose(e).head;
    p.cooldown=0;
    shoot(run,aimFrom({...head,z:p.z},head));
  };
  fire();
  const expiry=e.reactionUntil, before={x:e.x,z:e.z};
  assert.equal(expiry,run.time+.75);
  assert.equal(run.events.filter(event=>event.type==='shriek').length,1);
  for (let i=0;i<10;i++) stepRun(run);
  fire();
  assert.equal(e.reactionUntil,expiry);
  assert.equal(run.events.some(event=>event.type==='shriek'),false);
  while (run.time+STEP<expiry) stepRun(run);
  assert.equal(distance(e,before),0);
  for (let i=0;i<30;i++) stepRun(run);
  assert.ok(e.target?.chase && distance(e,before)>.1);
});

test('a pursuing shrieker sustains a faster pace and gives up after losing cues',()=>{
  const run=focusRoom(), p=run.player;
  const e=addEnemy(run,'shrieker',p.x,p.z+7);
  e.yaw=0;e.nextThink=0;
  const home={x:e.x,z:e.z};
  e.home=home;
  let faster=0;
  for (let i=0;i<140;i++) {
    const old={x:e.x,z:e.z};
    stepRun(run,{moveZ:-1});
    if (distance(e,old)/STEP>2.72) faster++;
    if (run.status!=='playing') break;
  }
  assert.ok(faster>30);
  run.status='playing';
  p.protection=20;
  p.x+=27;
  run.world.clear=()=>false;
  run.noises.length=0;
  for (let i=0;i<255;i++) stepRun(run);
  assert.equal(e.target?.chase??false,false);
});

test('resident health and deaths persist when the player streams out and back',()=>{
  const run=createRun('fixed-residents',{crafted:true});
  const p=run.player, nearby={x:p.x,z:p.z};
  const [living,fallen]=run.enemies;
  assert.ok(living && fallen);
  living.hp-=1.25;
  fallen.dead=true;
  const condition=living.hp;
  Object.assign(p,run.world.map.starts.find(at=>distance(nearby,at)>125));
  run.campaign.nextCheck=0;
  stepRun(run);
  assert.ok(!run.enemies.includes(living));
  Object.assign(p,nearby);
  run.campaign.nextCheck=0;
  stepRun(run);
  assert.ok(run.enemies.includes(living));
  assert.equal(living.hp,condition);
  assert.ok(!run.enemies.includes(fallen));
  assert.ok(fallen.resident.enemy.dead);
});

test('custom settings preserve rematch parameters but do not rank on the plateau or classic boards',()=>{
  const tuning=defaultTuning('standard');
  tuning.population=0;
  tuning.enemies.brute.head=8;
  const custom=createRun('custom',{crafted:true,tuning});
  assert.equal(custom.campaign.residents.length,0);
  assert.equal(custom.campaign.ranked,false);
  assert.deepEqual(custom.campaign.tuning,tuning);
  assert.equal(recordRun(custom,'plat-custom','YES').place,0);
  const ranked=createRun('recorded',{crafted:true,populate:false});
  ranked.status='escaped';ranked.time=159;
  assert.equal(recordRun(ranked,'plat-escape','YES').place,1);
  assert.equal(listScores('standard','plateau')[0].escaped,true);
  assert.equal(listScores().some(record=>record.id==='plat-escape'),false);
});
