import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEnemy, createRun, stepRun } from '../src/simulation.js';
import { CHUNK, createWorld, distance, random } from '../src/world.js';
import { RADIO_GUARANTEE, reachableRadio, SEARCH_DISTANCE, visitBuildings } from '../src/extraction.js';

const districtSize = CHUNK * 12;

function placePlayer(run, point) {
  const { x,z } = point;
  Object.assign(run.player,{ x,z,y:run.world.height(x,z) });
}

function approach(site, metres) {
  return { x:site.door.x, z:site.z+Math.sign(site.door.z-site.z)*metres };
}

test('seeded tracks join districts of six distinct buildings with traversable shed interiors', () => {
  const world = createWorld('Blackwater'), same = createWorld('Blackwater'), other = createWorld('Cold Creek');
  const district = world.districtSites(0,-1);
  assert.equal(district.length,6);
  assert.deepEqual(district,same.districtSites(0,-1));
  assert.notDeepEqual(district.map(site=>[site.x,site.z]),other.districtSites(0,-1).map(site=>[site.x,site.z]));
  assert.equal(district.filter(site=>site.radio).length,4);
  const looks = new Set();
  for (let z=-2; z<=2; z++) for (let x=-2; x<=2; x++) {
    const sites = world.districtSites(x*districtSize,z*districtSize);
    const local = new Set();
    for (const site of sites) {
      const look = site.layout + ':' + site.palette;
      assert.ok(!local.has(look));
      local.add(look);
      looks.add(look);
      const closest = Math.min(...sites.filter(other=>other!==site).map(other=>distance(site,other)));
      assert.ok(closest>=79 && closest<=145);
      if (!site.radio) continue;
      const stand = site.radio.standing;
      const route = [site.door,site.inside,{x:site.inside.x,z:stand.z},stand];
      for (let i=1; i<route.length; i++) {
        const a=route[i-1], b=route[i], count=Math.ceil(distance(a,b)/.15);
        for (let j=0; j<=count; j++)
          assert.ok(!world.blocks(a.x+(b.x-a.x)*j/count,a.z+(b.z-a.z)*j/count,.29),site.id);
      }
      assert.ok(world.clear({...stand,y:world.height(stand.x,stand.z)+1.36},site.radio));
    }
  }
  assert.equal(looks.size,25);
});

test('one seeded radio can appear early and the 30th distinct shed forces placement after missed rolls', () => {
  for (const [seed,first] of [['district-path-0',7],['district-path-2',RADIO_GUARANTEE]]) {
    const run = createRun(seed,{populate:false});
    const sites = Array.from({length:8},(_,i)=>run.world.districtSites(i*districtSize,0)).flat().filter(site=>site.radio);
    placePlayer(run,approach(sites[0],SEARCH_DISTANCE+1));
    stepRun(run);
    assert.equal(run.search.sheds,0);
    for (let i=0; i<first; i++) {
      if (i+1<first) assert.ok(random(seed+':radio:'+sites[i].id)()>=1/25);
      placePlayer(run,approach(sites[i],9));
      run.time += .5;
      stepRun(run);
      assert.equal(run.search.sheds,i+1);
      assert.equal(run.search.radio?.id,i+1===first?sites[i].id:undefined);
    }
    const radio = run.search.radio, original = sites[first-1];
    const cx = Math.floor(original.x/CHUNK), cz = Math.floor(original.z/CHUNK);
    const tile = run.world.chunk(cx,cz);
    for (let i=1; i<=140; i++) run.world.chunk(cx+i,cz+40);
    const returned = run.world.chunk(cx,cz);
    assert.notEqual(returned,tile);
    assert.deepEqual(returned.buildings,[original]);
    placePlayer(run,approach(original,8));
    run.time += .5;
    stepRun(run,{interact:true});
    assert.equal(run.status,'playing');
    assert.equal(run.search.sheds,first);
    assert.equal(run.search.radio,radio);
    placePlayer(run,approach(sites[first],9));
    run.time += .5;
    stepRun(run);
    assert.equal(run.search.radio,radio);
    assert.equal([...run.search.visits.values()].filter(visit=>visit.hasRadio).length,1);
    placePlayer(run,radio.standing);
    assert.equal(reachableRadio(run),radio);
    stepRun(run);
    assert.equal(run.offer,radio);
    assert.ok(stepRun(run,{interact:true}).some(event=>event.type==='extraction'));
    assert.equal(run.status,'escaped');
    const time=run.time;
    assert.deepEqual(stepRun(run,{interact:true,fire:true,moveZ:1}),[]);
    assert.equal(run.time,time);
  }
});

test('close building searches spawn hidden threats within the active cap and never reset', () => {
  const run = createRun('Blackwater',{populate:false}), world = run.world;
  const sites = world.districtSites(0,0);
  for (const [site, expected] of [[sites[2],'interior'],[sites[0],'exterior'],[sites[1],'empty']]) {
    placePlayer(run,approach(site,9));
    run.enemies.length=0;
    visitBuildings(run,1,addEnemy);
    const visit=run.search.visits.get(site.id);
    assert.equal(visit.encounter,expected);
    assert.equal(run.enemies.length,expected==='empty'?0:1);
    const head={...run.player,y:run.player.y+run.player.eyeHeight};
    for(const enemy of run.enemies) {
      assert.equal(world.clear(head,{...enemy,y:enemy.y+1.15}),false);
      assert.equal(world.clear(head,{...enemy,y:enemy.y+1.76}),false);
    }
    run.enemies.length=0;
    visitBuildings(run,1,addEnemy);
    assert.equal(run.enemies.length,0);
    assert.equal(run.search.visits.get(site.id),visit);
  }
});
