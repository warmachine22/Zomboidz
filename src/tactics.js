import { distance } from './world.js';
import { insideShelter, shelterRoute } from './campaign.js';

export function updatePursuitRoles(run) {
  const {campaign,time}=run;
  if (time<campaign.nextTactics) return;
  campaign.nextTactics=time+.55;
  const pack=run.enemies.filter(e=>!e.dead && e.target?.chase && distance(e,e.target)<23)
    .sort((a,b)=>distance(a,a.target)-distance(b,b.target));
  const anchor=pack[0];
  let left=null,right=null;
  if (pack.length>1) {
    const dx=anchor.x-anchor.target.x,dz=anchor.z-anchor.target.z;
    for (const e of pack.slice(1)) {
      if (e.rushUntil>time || distance(e,e.target)<3.5 || distance(e.target,anchor.target)>8) continue;
      const side=dz*(e.x-anchor.target.x)-dx*(e.z-anchor.target.z);
      if (side<0 && !left) left=e;
      else if (side>=0 && !right) right=e;
    }
  }
  for (const e of run.enemies) {
    const role=e===left?-1:e===right?1:0;
    if (e.flankRole!==role) e.coveredRoute=null;
    e.flankRole=role;
  }
}

function chooseCover(run,e,t,role) {
  const {world,time}=run, approach=distance(e,t);
  const dx=(t.x-e.x)/approach,dz=(t.z-e.z)/approach;
  const side=role*(4+Math.min(3,approach*.14));
  const lead=t.id==='player'?1.2:0;
  const lane={x:t.x-dz*side+(t.vx??0)*lead,z:t.z+dx*side+(t.vz??0)*lead};
  const atHeight=(p,height)=>({...p,y:world.height(p.x,p.z)+height});
  const eye=atHeight(e,1), observer=atHeight(t,1.45);
  const trees=world.around(lane.x,lane.z,5).flatMap(tile=>tile.trees)
    .filter(tree=>tree.r>.40 && distance(tree,lane)<5 && distance(tree,t)>3.2 && distance(tree,e)>1.5)
    .sort((a,b)=>distance(a,lane)-distance(b,lane)).slice(0,4);
  for (const tree of trees) {
    const length=distance(t,tree), x=(tree.x-t.x)/length,z=(tree.z-t.z)/length;
    const at={x:tree.x+x*(tree.r+.48),z:tree.z+z*(tree.r+.48)};
    if (distance(e,at)>approach*1.35 || world.blocks(at.x,at.z,.35)) continue;
    if (!world.clear(eye,atHeight(at,.9),false) || world.clear(observer,atHeight(at,1.25),false)) continue;
    return {...at,covered:true,until:time+2.4};
  }
  if (world.blocks(lane.x,lane.z,.45) || !world.clear(eye,atHeight(lane,.9),false)) return null;
  return {...lane,covered:false,until:time+2};
}

function localSearch(world,e,t) {
  if (!t.chase || !t.reason?.startsWith('last ')) return null;
  if (e.search?.memory!==e.memory) {
    if (distance(e,t)>1.20) return null;
    const angle=e.yaw, sign=e.turnSide, x=Math.cos(angle)*sign,z=Math.sin(angle)*sign;
    const eye={x:e.x,y:e.y+.75,z:e.z};
    const points=[{x:t.x+x*1.9,z:t.z+z*1.9},{x:t.x-x*1.65,z:t.z-z*1.65}]
      .filter(p=>!world.blocks(p.x,p.z,.40) && world.clear(eye,{...p,y:world.height(p.x,p.z)+.75}));
    e.search={memory:e.memory,points};
  }
  const points=e.search.points;
  if (points.length && distance(e,points[0])<.55) points.shift();
  e.reason='searching last known position';
  return points[0]??{x:e.x,z:e.z};
}

export function pursuitRoute(run,e,t) {
  const {world,time}=run;
  const search=localSearch(world,e,t);
  if (search) return search;
  const portal=shelterRoute(world,e,t);
  if (portal!==t || !e.flankRole || !t.chase || distance(e,t)<3.4 ||
      world.map.shelters.some(s=>Math.abs(s.x-e.x)<8 && Math.abs(s.z-e.z)<8 && insideShelter(e,s))) return portal;
  if (e.coveredRoute && (distance(e,e.coveredRoute)<.9 || e.coveredRoute.until<time)) {
    e.coveredRoute=null;
    e.nextCover=time+1.55;
  }
  if (!e.coveredRoute && !(e.nextCover>time)) {
    e.nextCover=time+.85;
    e.coveredRoute=chooseCover(run,e,t,e.flankRole);
    if (e.coveredRoute?.covered) run.metrics.coverRoutes++;
  }
  if (e.coveredRoute) e.reason=e.coveredRoute.covered?'flanking behind a tree':'flanking wide';
  return e.coveredRoute??t;
}
