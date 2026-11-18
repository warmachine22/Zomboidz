import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRun, STEP, stepRun } from '../src/simulation.js';
import { distance } from '../src/world.js';
import { findPath } from './check-search.mjs';

const seeds=Array.from({length:12},(_,i)=>'forest-patrol-'+i);
const baseline=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice(11);
const original=baseline?await import(pathToFileURL(resolve(baseline))):null;
const p95=list=>list.toSorted((a,b)=>a-b)[Math.ceil(list.length*.95)-1];

function scenario(api,seed) {
  const r=api.createRun(seed,{crafted:true}), p=r.player;
  const site=r.world.map.shelters.toSorted((a,b)=>distance(p,a.door)-distance(p,b.door))[0];
  const path=[...findPath(r.world,p,site.door),...findPath(r.world,site.door,site.part,.6)];
  p.protection=120;
  const first=r.enemies.length, times=[];
  let coverRoute=0, maxInside=0, index=0, lastFire=0;
  while (index<path.length && r.time<90 && r.status==='playing') {
    const target=path[index], gap=distance(p,target);
    if (gap<.12) { index++; continue; }
    const dx=target.x-p.x, dz=target.z-p.z, yaw=Math.atan2(dx,-dz);
    const pace=1/Math.max(gap,2.72*STEP), fire=index>path.length-13 && r.time-lastFire>.76;
    if (fire) lastFire=r.time;
    const before=performance.now();
    api.stepRun(r,{yaw,moveX:dx*pace,moveZ:dz*pace,fire});
    times.push(performance.now()-before);
    maxInside=Math.max(maxInside,r.enemies.filter(e=>Math.abs(e.x-site.x)<site.w/2-.25 &&
      Math.abs(e.z-site.z)<site.d/2-.25).length);
    coverRoute=r.metrics.coverRoutes??0;
  }
  assert.ok(index===path.length,seed+' could not reach '+site.name);
  return {seed,first,active:r.metrics.maxCrowd,maxInside,ambushes:r.metrics.ambushes.emerged,coverRoute,p95:p95(times)};
}

const collect=api=>seeds.map(seed=>scenario(api,seed));
const summarize=rows=>({
  routes:rows.length, openings:rows.map(r=>r.first), peak:Math.max(...rows.map(r=>r.active)),
  indoorPeaks:rows.map(r=>r.maxInside), ambushes:rows.reduce((sum,r)=>sum+r.ambushes,0),
  coveredFlanks:rows.reduce((sum,r)=>sum+r.coverRoute,0),
  meanRouteP95StepMs:Number((rows.reduce((sum,r)=>sum+r.p95,0)/rows.length).toFixed(3)),
});
const current=collect({createRun,stepRun});
assert.ok(current.every(row=>row.first>=1 && row.active<=10));
assert.ok(current.every(row=>row.maxInside>=2));
assert.ok(current.some(row=>row.ambushes>0));
console.log(JSON.stringify({current:summarize(current),baseline:original?summarize(collect(original)):undefined},null,2));
