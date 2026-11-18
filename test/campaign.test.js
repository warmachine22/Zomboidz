import test from 'node:test';
import assert from 'node:assert/strict';
import { addEnemy, callExtraction, createRun, enemyPose, GUNS, shoot, STEP, stepRun, traceAim, UPGRADES } from '../src/simulation.js';
import { defaultTuning, residentPerception } from '../src/campaign.js';
import { activeHordeLimit } from '../src/difficulty.js';
import { distance } from '../src/world.js';
import { listScores, recordRun } from '../src/records.js';
import { pursuitRoute, updatePursuitRoles } from '../src/tactics.js';
import { LARGE_TREE_COUNT } from '../src/tree-posts.js';

function focusRoom(seed='plateau-room', options={}) {
  const run=createRun(seed,{crafted:true,populate:false,...options});
  Object.assign(run.world,{height:()=>0,blocks:()=>false,clear:()=>true,raycast:()=>null});
  Object.assign(run.player,{x:330,y:0,z:281,flashlight:false});
  return run;
}

const aimFrom=(origin,at)=>({origin,ray:{x:at.x-origin.x,y:at.y-origin.y,z:at.z-origin.z}});

test('plateau presets have a fixed population and a device-limited nearby crowd',()=>{
  for (const [difficulty,treeShare,guards,cap] of [['easy',.20,90,8],['standard',.30,115,10],['hard',.35,140,12]]) {
    const run=createRun('population',{difficulty,crafted:true});
    const records=run.campaign.residents.map(r=>r.site);
    const trees=records.filter(site=>site.tree);
    assert.equal(trees.length,Math.round(LARGE_TREE_COUNT*treeShare));
    assert.equal(new Set(trees.map(site=>site.id)).size,trees.length);
    assert.equal(records.length,trees.length+guards);
    for (const shelter of run.world.map.shelters) {
      const posts=records.filter(site=>site.shelter===shelter);
      assert.equal(posts.filter(site=>site.room!==null).length,shelter.rooms);
      assert.equal(posts.filter(site=>site.room===null).length,(guards-65)/25);
      assert.ok(posts.every(p=>!run.world.blocks(p.x,p.z,.36)),shelter.name);
    }
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
        assert.equal(Boolean(run.events.filter(e=>e.type==='impact').at(-1).rupture),zone==='head' && shot===count);
        assert.equal(Boolean(e.dead),shot===count,kind+' '+zone+' '+shot);
      }
      assert.equal(run.corpses.at(-1).headLost,zone==='head');
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

test('shots attract nearby zombies only, with reduced reach through cover',()=>{
  const run=focusRoom(), p=run.player;
  const close=addEnemy(run,'shambler',p.x+15,p.z), far=addEnemy(run,'shambler',p.x+22,p.z);
  const hidden=addEnemy(run,'shambler',p.x-12,p.z);
  run.world.clear=(a,b,ground)=>ground!==false || a.x>=p.x;
  shoot(run,{origin:{x:p.x,y:1.5,z:p.z},ray:{x:0,y:0,z:-1}});
  for (const e of run.enemies) {
    e.yaw=Math.PI/2;
    residentPerception(run,e,distance(p,e));
  }
  assert.equal(close.target?.reason,'gunshot');
  assert.equal(far.target,null);
  assert.equal(hidden.target,null);
});

test('gunfire outside does not pull a back-room guard away from its room',()=>{
  const run=focusRoom(), p=run.player, site=run.world.map.shelters[0];
  const guard=addEnemy(run,'shambler',site.part.x,site.part.z);
  Object.defineProperty(guard,'resident',{value:{site:{shelter:site,room:1}}});
  run.world.clear=(a,b,sense)=>sense===false;
  Object.assign(p,{x:site.x-site.w/2-1,z:site.part.z});
  run.noises=[{kind:'gunshot',origin:{x:p.x,y:1.4,z:p.z},radius:17,born:0,span:1.55}];
  residentPerception(run,guard,distance(p,guard));
  assert.equal(guard.target,null);
  run.noises[0].origin={...site.ammo,y:1.4};
  residentPerception(run,guard,distance(p,guard));
  assert.equal(guard.target?.reason,'gunshot');
});

test('a hidden shambler warns before rushing a player who passes, and can catch them',()=>{
  const run=focusRoom(), p=run.player;
  const e=addEnemy(run,'shambler',p.x,p.z-2.1);
  const home={x:e.x,z:e.z};
  e.home=home;e.hiding=true;e.yaw=Math.PI;e.nextThink=0;
  Object.defineProperty(e,'resident',{value:{site:{x:e.x,z:e.z,tree:{x:e.x,z:e.z-.95,r:.68}}}});
  // This actor exists in a flat fixture rather than a streamed population.
  run.campaign.nextCheck=Infinity;
  let warned=null, burst=0;
  for (let i=0;i<210 && run.status==='playing';i++) {
    const previous={x:e.x,z:e.z};
    const events=stepRun(run,{yaw:Math.PI,moveZ:1});
    if (events.some(event=>event.type==='shriek' && event.id===e.id)) warned??=run.time;
    if (warned!==null && run.time<e.warningUntil) assert.equal(distance(e,home),0);
    if (distance(previous,e)/STEP>2.72) burst++;
  }
  assert.ok(warned!==null);
  assert.ok(burst>12);
  assert.equal(run.status,'dead');
  assert.ok(run.time-warned>1.1);
});

test('pursuit keeps a direct attacker and chooses a traversable covered flank',()=>{
  const run=focusRoom(), p=run.player;
  const leader=addEnemy(run,'shambler',p.x,p.z+4), flank=addEnemy(run,'shambler',p.x-5,p.z+8);
  const tree={x:p.x-5,z:p.z+1,r:.75};
  run.world.around=()=>[{trees:[tree]}];
  run.world.clear=(a)=>a.x!==p.x || a.z!==p.z;
  for (const e of [leader,flank]) e.target={x:p.x,z:p.z,chase:true,id:'player'};
  updatePursuitRoles(run);
  assert.equal(leader.flankRole,0);
  assert.notEqual(flank.flankRole,0);
  const route=pursuitRoute(run,flank,flank.target);
  assert.equal(route.covered,true);
  assert.equal(flank.reason,'flanking behind a tree');
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
