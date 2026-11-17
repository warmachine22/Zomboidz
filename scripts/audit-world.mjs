import assert from 'node:assert/strict';
import { findPath } from './check-search.mjs';
import { makeDistrict } from '../src/districts.js';
import { RADIO_GUARANTEE, SEARCH_DISTANCE, visitBuildings } from '../src/extraction.js';
import { createRun, STEP, stepRun } from '../src/simulation.js';
import { CHUNK, createWorld, direction, distance, random, START } from '../src/world.js';

const size = CHUNK * 12;
const speed = 2.72;
const namedSeeds = ['Blackwater','Cold Creek','Reed Valley','Split Pine','Rain Line','district-path-0','district-path-2','1','2','3','4','5'];
const seed = index => namedSeeds[index] ?? 'world-audit-' + index.toString(36);
const statistics = values => {
  const sorted = [...values].sort((a,b)=>a-b);
  const at = q => sorted[Math.floor((sorted.length-1)*q)];
  const middle = Math.floor(sorted.length/2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle])/2;
  return { count:sorted.length, min:at(0), median:sorted.length ? median : null, p90:at(.9), max:at(1),
    mean:sorted.length ? sorted.reduce((a,b)=>a+b,0)/sorted.length : null };
};

function walkTo(run, target) {
  const p = run.player;
  let stalled = 0;
  while (distance(p,target) > .14) {
    const x = p.x, z = p.z;
    const gap = distance(p,target), scale = Math.min(1,gap/(STEP*speed));
    const moveX = (target.x-x)/gap*scale, moveZ = (target.z-z)/gap*scale;
    stepRun(run,{ moveX,moveZ,yaw:Math.atan2(moveX,-moveZ) });
    stalled = Math.hypot(x-p.x,z-p.z) < .003 ? stalled + STEP : 0;
    assert.ok(stalled < 2,'Could not walk to ' + JSON.stringify(target));
  }
}

function searchWorld(seedName) {
  const run = createRun(seedName,{populate:false});
  const { player, world } = run;
  const inspected = new Set(), neighbors = new Map();
  let firstShed;
  for (let n = 0; n < RADIO_GUARANTEE + 4; n++) {
    const column = Math.floor(player.x/size), row = Math.floor(player.z/size);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = column+dx, z = row+dz, id = x+','+z;
      if (!neighbors.has(id)) neighbors.set(id,world.districtSites(x*size,z*size).filter(site=>site.radio));
    }
    const ordered = [...neighbors.values()].flat().filter(site=>!inspected.has(site.id))
      .sort((a,b)=>distance(player,a.door)-distance(player,b.door));
    const site = ordered[0];
    let path;
    try { path = findPath(world,player,site.door); }
    catch { path = findPath(world,player,site.door,1); }
    for (const point of path) walkTo(run,point);
    firstShed ??= run.time;
    const stand = site.radio.standing, corner = { x:site.inside.x,z:stand.z };
    for (const point of [site.inside,corner,stand]) walkTo(run,point);
    inspected.add(site.id);
    if (run.offer?.kind === 'radio') {
      const events = stepRun(run,{interact:true});
      assert.ok(events.some(e=>e.type==='extraction') && run.status === 'escaped');
      assert.equal(run.metrics.maxCrowd,0);
      return { seed:seedName, seconds:run.time, firstDoorSeconds:firstShed,
        shedsEntered:inspected.size, shedsRolled:run.search.sheds };
    }
    for (const point of [corner,site.inside,site.door]) walkTo(run,point);
  }
  throw Error('No extractable radio after ' + run.search.sheds + ' shed approaches for ' + seedName);
}

function oddsAudit() {
  const tries = 25000;
  const world = createWorld('audit-template');
  const sheds = Array.from({length:8},(_,i)=>world.districtSites(i*size,0))
    .flat().filter(site=>site.radio);
  const distribution = Array(RADIO_GUARANTEE).fill(0);
  for (let i = 0; i < tries; i++) {
    const area = { buildings:[] };
    const run = { seed:'audit-odds-'+i.toString(36), world:{around:()=>[area]}, player:null,
      time:0,enemies:[],search:{sheds:0,visits:new Map(),radio:null} };
    let found;
    for (const [index,site] of sheds.entries()) {
      area.buildings = [site];
      run.player = site;
      visitBuildings(run,0,()=>assert.fail('A building encounter exceeded the zero-enemy budget'));
      assert.equal(run.search.sheds,index+1);
      if (run.search.radio && !found) {
        found = run.search.radio.id;
        assert.ok(index < RADIO_GUARANTEE);
        distribution[index]++;
        visitBuildings(run,0,()=>assert.fail('Revisit spawned an enemy'));
        assert.equal(run.search.sheds,index+1);
      }
    }
    assert.equal(run.search.radio?.id,found);
    assert.equal([...run.search.visits.values()].filter(visit=>visit.hasRadio).length,1);
  }
  const by = k => distribution.slice(0,k).reduce((a,b)=>a+b,0)/tries;
  return { tries, distribution, mean:distribution.reduce((sum,count,i)=>sum+count*(i+1),0)/tries,
    foundBy:Object.fromEntries([1,4,10,20,29,30].map(k=>[k,by(k)])), at30:distribution.at(-1)/tries };
}

function rayEntry(origin, heading, point, radius, maxDistance) {
  const dx = point.x-origin.x, dz = point.z-origin.z;
  const along = dx*heading.x+dz*heading.z, across = dx*heading.z-dz*heading.x;
  if (Math.abs(across) > radius) return Infinity;
  const reach = Math.sqrt(radius**2-across**2);
  if (along+reach < 0 || along-reach > maxDistance) return Infinity;
  return Math.max(0,along-reach);
}

function directionalAudit() {
  const headings = 32, seedCount = 72, length = 5000;
  const hits = Array.from({length:headings},()=>[]);
  const encounterCounts = [], gaps = [];
  const ring = Math.ceil((length+SEARCH_DISTANCE)/size);
  for (let i = 0; i < seedCount; i++) {
    const sheds = [];
    for (let z = -ring; z <= ring; z++) for (let x = -ring; x <= ring; x++) {
      const { buildings } = makeDistrict(seed(i),x,z,CHUNK,random);
      // The three shed layouts are verified against materialized sites below.
      const eligible = [...buildings.values()].filter(site=>site.layout < 3);
      assert.equal(buildings.size,6);
      assert.equal(eligible.length,4);
      sheds.push(...eligible);
    }
    for (let j = 0; j < headings; j++) {
      const heading = direction(j*2*Math.PI/headings);
      const encounters = sheds.map(s=>rayEntry(START,heading,s,SEARCH_DISTANCE,length)).filter(Number.isFinite).sort((a,b)=>a-b);
      hits[j].push(encounters[0] ?? Infinity);
      encounterCounts.push(encounters.length);
      for (let k = 1; k < encounters.length; k++) gaps.push((encounters[k]-encounters[k-1])/speed);
    }
  }
  const all = hits.flat();
  return { seedCount, headings, metres:length, districtPlans:seedCount*(2*ring+1)**2,
    byDistance:Object.fromEntries([500,1000,2000,3000,5000].map(m=>[m,all.filter(hit=>hit<=m).length])),
    secondsWhenHit:statistics(all.filter(Number.isFinite).map(m=>m/speed)),
    secondsTruncatedMean:all.reduce((sum,hit)=>sum+Math.min(hit,length)/speed,0)/all.length,
    multipleSheds:encounterCounts.filter(count=>count>1).length, secondsBetweenSheds:statistics(gaps),
    byHeading:hits.map((values,i)=>({degrees:i*360/headings,
      hits:values.filter(Number.isFinite).length, seconds:statistics(values.filter(Number.isFinite).map(m=>m/speed)) })) };
}

function fixedInputAudit() {
  const rows = [];
  for (const seedName of namedSeeds) for (let i = 0; i < 4; i++) {
    const run = createRun(seedName,{populate:false});
    const yaw = i*Math.PI/2, heading = direction(yaw), p = run.player;
    let stalled = 0;
    while (run.time < 300 && !run.search.sheds && stalled < 2) {
      const x = p.x, z = p.z;
      stepRun(run,{moveX:heading.x,moveZ:heading.z,yaw});
      stalled = Math.hypot(x-p.x,z-p.z) < .001 ? stalled+STEP : 0;
    }
    rows.push({ degrees:i*90,distance:distance(START,p),stalled:stalled>=2,shed:run.search.sheds>0 });
  }
  return { runs:rows.length, stalled:rows.filter(row=>row.stalled).length,
    hit:rows.filter(row=>row.shed).length, distance:statistics(rows.map(row=>row.distance)) };
}

function landmarkAudit() {
  const seedCount = 48;
  const biomes = {}, counts = { buildings:0,sheds:0,wrecks:0,campsites:0,lanterns:0,litWrecks:0,buildingWrecks:0 };
  const dressing = { carcasses:0,people:0,vehicles:0,motorcycles:0,logBarriers:0,rocks:0,triangles:0,colliders:0 };
  const layoutLooks = new Set(), variants = new Map();
  const passes = { sheds:0,wrecks:0,campsites:0 };
  const tree = { count:0,min:Infinity,max:0,thickest:0 };
  for (let i = 0; i < seedCount; i++) {
    const seedName = seed(i), world = createWorld(seedName), cx = i%8-4, cz = i%2 ? 5 : -5;
    const sites = world.districtSites(cx*size,cz*size);
    const layout = makeDistrict(seedName,cx,cz,CHUNK,random);
    assert.equal(sites.length,6);
    assert.equal(sites.filter(site=>site.radio).length,4);
    assert.deepEqual(sites.filter(site=>site.radio).map(site=>site.id),
      [...layout.buildings.values()].filter(site=>site.layout<3).map(site=>site.id));
    counts.buildings += sites.length;
    counts.sheds += sites.filter(site=>site.radio).length;
    counts.lanterns += sites.filter(site=>site.lantern).length;
    for (const site of sites) {
      layoutLooks.add(site.layout+':'+site.palette);
      variants.set(site.name,(variants.get(site.name) ?? 0)+1);
    }
    const landmarks = { sheds:sites.filter(site=>site.radio), wrecks:[],campsites:[] };
    for (let z = 0; z < 12; z++) for (let x = 0; x < 12; x++) {
      const tile = world.chunk(cx*12+x,cz*12+z);
      biomes[tile.biome] = (biomes[tile.biome] ?? 0) + 1;
      for (const t of tile.trees) {
        tree.count++;
        tree.min = Math.min(tree.min,t.height);
        tree.max = Math.max(tree.max,t.height);
        tree.thickest = Math.max(tree.thickest,t.r*2);
      }
      for (const prop of tile.props) {
        if (prop.kind === 'wreck') {
          counts.wrecks++;
          if (tile.lights.some(light=>light.type==='wreck')) counts.litWrecks++;
          if (tile.buildings.length) counts.buildingWrecks++;
          landmarks.wrecks.push(prop);
        }
        if (prop.kind === 'firepit') { counts.campsites++; landmarks.campsites.push(prop); }
      }
      if (tile.decor) {
        const d = tile.decor;
        dressing.carcasses += d.remains.filter(r => ['deer', 'bear', 'fox', 'rabbit'].includes(r.kind)).length;
        dressing.people += d.remains.filter(r => r.kind.startsWith('person')).length;
        dressing.vehicles += d.vehicles.filter(v => ['sedan', 'pickup', 'van'].includes(v.kind)).length;
        dressing.motorcycles += d.vehicles.filter(v => v.kind.startsWith('moto')).length;
        dressing.logBarriers += d.logs.filter(l => l.barrier).length;
        dressing.rocks += d.rocks.length;
        dressing.triangles += d.triangles;
        dressing.colliders += d.colliders;
      }
    }
    for (let lane = 0; lane < 12; lane++) {
      const offset = (lane+.5)*CHUNK;
      for (const [kind,places] of Object.entries(landmarks)) for (const point of places) {
        if (Math.abs(point.x - (cx*size+offset)) <= 35) passes[kind]++;
        if (Math.abs(point.z - (cz*size+offset)) <= 35) passes[kind]++;
      }
    }
  }
  const tiles = seedCount * 144;
  return { seedCount, tiles, areaKm2:seedCount*(size/1000)**2, counts,
    dressing: { ...dressing, avgTriangles: Math.round(dressing.triangles / tiles), avgColliders: +(dressing.colliders / tiles).toFixed(2) },
    biomes, tree, uniqueBuildingLooks:layoutLooks.size, layouts:Object.fromEntries(variants),
    passesWithin35m:passes, corridorKm:seedCount*24*size/1000 };
}

const section = process.argv[2] ?? 'all';
assert.ok(['all','odds','directions','landmarks','search'].includes(section),'Unknown audit section: ' + section);
const report = (name, data) => console.log(name,JSON.stringify(data));
if (section === 'all' || section === 'odds') report('radioOdds',oddsAudit());
if (section === 'all' || section === 'directions') {
  report('straightCorridors',directionalAudit());
  report('fixedInput',fixedInputAudit());
}
if (section === 'all' || section === 'landmarks') report('landmarks',landmarkAudit());
if (section === 'all' || section === 'search') {
  const count = Number(process.argv[3] ?? 12);
  assert.ok(Number.isInteger(count) && count >= 1 && count <= 72);
  const routes = Array.from({length:count},(_,i)=>{
    const result = searchWorld(seed(i));
    report('extracted',result);
    return result;
  });
  report('searchSummary',{ seconds:statistics(routes.map(route=>route.seconds)),
    firstDoorSeconds:statistics(routes.map(route=>route.firstDoorSeconds)),
    sheds:statistics(routes.map(route=>route.shedsEntered)), forced:routes.filter(route=>route.shedsRolled===30).length });
}
