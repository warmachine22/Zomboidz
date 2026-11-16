import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ambushDecision, reserveAmbush } from '../src/ambush.js';
import { animatedAnchors, attackContact, solvedEnemyPose, strideLength, updateEnemyFooting } from '../src/enemy-motion.js';
import { addEnemy, createRun, ENEMIES, hordeTarget, STEP, stepRun } from '../src/simulation.js';
import { listScores, recordRun } from '../src/records.js';
import { createWorld } from '../src/world.js';

test('Hard ramps faster on the same seed and has shorter ambush intervals', () => {
  const standard=createRun('rain'), hard=createRun('rain',{difficulty:'hard'});
  assert.equal(hordeTarget(210,'hard'),32);
  assert.equal(hordeTarget(390,'hard'),48);
  assert.equal(hordeTarget(300,'standard'),32);
  assert.equal(hordeTarget(540,'standard'),48);
  assert.deepEqual(hard.enemies.map(e=>[e.spawn.x,e.spawn.z]),standard.enemies.map(e=>[e.spawn.x,e.spawn.z]));
  assert.ok(hard.nextAmbush < standard.nextAmbush);
  assert.ok(hard.enemies.every(e=>e.approach.at>=18 && e.approach.at<26));
});

test('more than ten Standard runs retain Hard and legacy scores in their own tables', () => {
  const old = globalThis.localStorage;
  const items = new Map([['zomboidz.scores.v1', JSON.stringify([{id:'legacy',time:21,kills:1,headshots:0,initials:'OLD'}])]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable:true,value:{
    getItem:key=>items.get(key),setItem:(key,value)=>items.set(key,value),
  } });
  try {
    const run={seed:'test',time:16,player:{kills:2,headshots:1},difficulty:'hard'};
    recordRun(run,'hard','H');
    run.difficulty='standard';
    for (let i=0;i<12;i++) recordRun(run,'standard-'+i,'S');
    assert.equal(listScores('standard').length,10);
    assert.equal(listScores('standard')[0].id,'legacy');
    assert.deepEqual(listScores('hard').map(row=>row.id),['hard']);
  } finally {
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:old});
  }
});

test('groves vary in density and contain stable thick trunks, sheds and campsite landmarks', () => {
  const a=createWorld('Blackwater'), b=createWorld('Blackwater'), areas=[];
  for (let z=-5;z<=5;z++) for (let x=-5;x<=5;x++) areas.push(a.chunk(x,z));
  assert.ok(areas.some(area=>area.trees.some(tree=>tree.r>=.85 && tree.crown>=4.4)));
  assert.ok(areas.some(area=>area.trees.some(tree=>tree.r<.19)));
  const shed=areas.find(area=>area.props.some(o=>o.kind==='shedRoof'));
  const camp=areas.find(area=>area.props.some(o=>o.kind==='campTent'));
  assert.ok(shed && camp);
  for (const area of [shed,camp]) {
    const other=b.chunk(area.cx,area.cz);
    assert.deepEqual(area.props,other.props);
    assert.deepEqual(area.loot,other.loot);
  }
  const roof=shed.props.find(o=>o.kind==='shedRoof');
  assert.equal(a.blocks(roof.x,roof.z,.26),false,'the roof leaves the shed interior walkable');
});

function room(difficulty='standard') {
  const run=createRun('test',{populate:false,difficulty});
  Object.assign(run.world,{height:()=>0,blocks:()=>false,raycast:()=>null,clear:()=>true,around:()=>[],
    move(p,x,z){p.x+=x;p.z+=z;}});
  return run;
}

test('an existing zombie waits behind cover and follows a close footstep after an audible cue', () => {
  const run=room('hard'), p=run.player;
  Object.assign(p,{x:0,z:0,y:0,yaw:Math.PI,travelZ:1});
  const tree={x:0,z:10,r:.75,kind:'bark'};
  run.world.around=()=>[{colliders:[tree]}];
  run.world.clear=(a,b)=>{
    if ((a.z-10)*(b.z-10)>=0) return true;
    const x=a.x+(b.x-a.x)*(10-a.z)/(b.z-a.z);
    return Math.abs(x)>.75;
  };
  const enemy=addEnemy(run,'shambler',0,11.29);
  run.nextAmbush=0;
  run.populate=true;
  reserveAmbush(run);
  assert.equal(run.enemies.length,1);
  let plan=ambushDecision(run,enemy,11.29,false);
  assert.equal(enemy.ambush.stage,'holding');
  assert.equal(plan.destination,null);
  p.z=6.8;
  run.noises.push({kind:'footstep',origin:{x:0,z:p.z,y:.25},born:run.time,radius:12});
  assert.equal(ambushDecision(run,enemy,4.49,false).destination,null,'the hidden enemy cues before emerging');
  enemy.lastVoice=run.time;
  plan=ambushDecision(run,enemy,4.49,false);
  assert.equal(enemy.ambush.stage,'emerging');
  assert.equal(plan.destination,enemy.ambush.exit);
});

test('running around cover in any compass direction encounters later arrivals without exceeding the crowd limit', () => {
  for (const difficulty of ['standard','hard']) for (let sector=0; sector<4; sector++) {
    const run=createRun('Reed Valley',{difficulty,crowdLimit:10});
    const p=run.player, goal=sector*Math.PI/2;
    let facedArrival=false;
    const options=[0,.35,-.35,.7,-.7,1.05,-1.05,1.44,-1.44,2.05,-2.05,Math.PI].map(angle=>angle+goal);
    for (let i=0; i<125/STEP && run.status==='playing'; i++) {
      const yaw=options.find(angle=>!run.world.blocks(p.x+Math.sin(angle)*.73,p.z-Math.cos(angle)*.73,.37)) ?? goal;
      stepRun(run,{yaw,moveX:Math.sin(yaw),moveZ:-Math.cos(yaw)});
      assert.ok(run.enemies.length<=10);
      facedArrival ||= run.enemies.some(e=>e.spawn?.time>run.rules.opening && Math.hypot(e.x-p.x,e.z-p.z)<8.5 &&
        (e.x-p.x)*Math.sin(yaw)-(e.z-p.z)*Math.cos(yaw)>1);
      if (facedArrival && run.time>run.rules.opening+30) break;
    }
    assert.ok(facedArrival || run.status==='dead',difficulty+' route '+sector+' escaped pressure');
  }
});

test('one exported contact emits one swing and checks reach and cover on the contact tick', () => {
  for (const block of [false,true]) {
    const run=room(), p=run.player;
    p.armor=2;
    const subject=addEnemy(run,'shambler',p.x,p.z-.84);
    let started,swung,hits=0;
    for(let i=0;i<31;i++) {
      for (const event of stepRun(run)) {
        if (event.type==='windup') {
          started=run.time;
          if (block) run.world.clear=()=>false;
        }
        if (event.type==='swing') {
          assert.equal(swung,undefined);
          swung=run.time;
          assert.ok(Math.abs(subject.attackAge*attackContact('shambler')/subject.attackWindup-attackContact('shambler')) < 1e-7);
        }
        if (event.type==='armorHit') hits++;
      }
    }
    assert.ok(Math.abs(swung-started-ENEMIES.shambler.windup)<STEP);
    assert.equal(hits,block?0:1);
  }
});

test('a planted shambler foot stays put and close slope correction brings its anchor onto raised ground', () => {
  const e={id:1,kind:'shambler',gait:0,yaw:0,x:0,y:0,z:0,stride:1,hitAge:Infinity};
  const start=animatedAnchors(e,.60)[9];
  for(let i=1;i<=12;i++) {
    const t=i/24;
    e.gait=t*Math.PI*2; e.z=-strideLength(e.kind)*t;
    const foot=animatedAnchors(e,.60)[9];
    assert.ok(Math.hypot(foot.x-start.x,foot.z-start.z)<.045);
  }
  e.gait=.28*Math.PI*2;
  const floor=()=>.10;
  const before=animatedAnchors(e,.60)[9];
  updateEnemyFooting({height:floor},e,.60,3);
  assert.ok(animatedAnchors(e,.60)[9].y>before.y+.07);
});

test('the shipped skin and simulation use the same blended joint transforms for head and hands', async () => {
  for (const kind of ['shambler','shrieker','brute']) {
    const bytes=await readFile(new URL('../assets/art/'+kind+'.glb',import.meta.url));
    const {scene,animations}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
    assert.ok(animations.some(clip=>clip.name==='FallLeft'));
    const entity={kind,id:1,gait:1.43,stride:.71,turnRate:2.3,hitAge:.12,hitFrom:'Right',x:2,y:.2,z:3,yaw:.7};
    const solved=solvedEnemyPose(entity,.6);
    scene.rotation.y=Math.PI-entity.yaw;
    scene.position.set(entity.x,entity.y,entity.z);
    for (const [i,name] of solved.rig.bones.entries()) {
      const bone=scene.getObjectByName(name);
      bone.position.copy(solved.joints[i].position);
      bone.quaternion.copy(solved.joints[i].rotation);
    }
    scene.updateMatrixWorld(true);
    const hits=animatedAnchors(entity,.6);
    for (const i of [0,6,9,12]) {
      const [bone,x,y,z]=solved.rig.anchors[i];
      const visual=new Vector3(x,y,z).applyMatrix4(scene.getObjectByName(solved.rig.bones[bone]).matrixWorld);
      assert.ok(visual.distanceTo(new Vector3(hits[i].x,hits[i].y,hits[i].z))<.001);
    }
    assert.ok(scene.getObjectByName('Neck').quaternion instanceof Quaternion);
  }
});
