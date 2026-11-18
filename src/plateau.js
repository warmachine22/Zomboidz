export const PLATEAU_SIZE = 720;

// Roads, clearings, slope centres, and building footprints are map data.
const areas = [
  { name:'North Ridge', biome:'ridge', hill:[332,145,16,123], road:[[350,320],[316,215],[352,95],[420,38]],
    sites:[[252,127,'Ranger Quarters'],[423,114,'Lookout Stores'],[353,64,'North Gate'],[275,225,'Stone Bothy'],[400,214,'Survey Hut']],
    starts:[[352,101],[316,197],[409,49]], props:[[297,151,'rocks'],[374,170,'wreck'],[456,76,'camp']] },
  { name:'West Pines', biome:'pine', hill:[145,288,8,107], road:[[350,320],[230,310],[110,362],[42,288]],
    sites:[[75,232,'Pine Lodge'],[159,269,'Saw Shed'],[71,370,'West Gate'],[163,377,'Timber Office'],[259,368,'Tool House']],
    starts:[[43,289],[123,355],[223,314]], props:[[112,248,'camp'],[182,340,'wreck'],[119,403,'rocks']] },
  { name:'Floodplain', biome:'gully', hill:[559,280,-9,106], road:[[350,320],[478,334],[585,291],[675,312]],
    sites:[[503,270,'Waterworks'],[618,248,'Pump Annex'],[657,373,'East Gate'],[569,352,'Gauge House'],[505,425,'Overflow Stores']],
    starts:[[477,332],[581,293],[666,310]], props:[[534,298,'wreck'],[631,315,'camp'],[608,403,'rocks']] },
  { name:'South Clearing', biome:'clearing', hill:[350,581,6,135], road:[[350,320],[351,460],[289,548],[376,660]],
    sites:[[255,463,'Crew Cabin'],[333,531,'Field Kitchen'],[237,594,'Stable'],[347,647,'South Gate'],[432,577,'Line Office']],
    starts:[[351,470],[284,550],[374,654]], props:[[283,497,'wreck'],[312,611,'camp'],[408,623,'rocks']] },
  { name:'Old Quarry', biome:'ridge', hill:[535,548,11,136], road:[[351,460],[455,494],[560,544],[636,665],[376,660]],
    sites:[[454,517,'Winch House'],[554,473,'Blasting Office'],[616,522,'Crusher Stores'],[558,606,'Quarry Bunkhouse'],[666,640,'Haulage Depot']],
    starts:[[447,491],[566,552],[624,651]], props:[[486,546,'rocks'],[586,580,'wreck'],[635,594,'camp']] },
];
const point = ([x,z]) => ({ x,z });
const segments = pairs => pairs.slice(1).map((end,i)=>[...pairs[i],...end]);
function projection(x,z,[ax,az,bx,bz]) {
  const dx=bx-ax,dz=bz-az;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz || 1)));
  return { x:ax+dx*t,z:az+dz*t };
}
const roads = areas.flatMap(area=>segments(area.road));
const shelters = areas.flatMap((area,zone)=>area.sites.map(([x,z,name],i)=>{
  const nearest=roads.map(r=>projection(x,z,r)).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
  const turn = z > nearest.z ? 0 : 2;
  const sign = turn === 2 ? -1 : 1;
  const w=9+i%3, d=9+(i+zone)%3, rooms=i%2===0 ? 3 : 2;
  const at=(dx,dz)=>({x:x+dx*sign,z:z+dz*sign});
  const door=at(0,-d/2-.32);
  const junction=roads.map(r=>projection(door.x,door.z,r))
    .sort((a,b)=>Math.hypot(a.x-door.x,a.z-door.z)-Math.hypot(b.x-door.x,b.z-door.z))[0];
  return { id:'shelter-'+(zone*5+i+1), x,z,name,zone,turn,sign,w,d,rooms,palette:(i+zone)%5,
    roof:(2*i+zone)%3, porch:i===0||i===4,
    door, junction, ammo:at(-w*.24,-d*.27), gear:at(w*.24,d*.29), part:at(-w*.25,d*.29),
    innerGuard:at(w*.28,-1.1), outerGuard:at(w*.5+3,d*.18), second:i<3 };
}));
const tracks = [...roads,...shelters.map(s=>[s.door.x,s.door.z,s.junction.x,s.junction.z])];
const starts = areas.flatMap(a=>a.starts.map(point));
const props = areas.flatMap(a=>a.props.map(([x,z,kind])=>({x,z,kind})));
const supplies = roads.map(([x,z,ex,ez],i)=>{
  const dx=ex-x,dz=ez-z,len=Math.hypot(dx,dz), side=i%2?-1:1;
  return {x:x+dx*.48-dz/len*side*2.3,z:z+dz*.48+dx/len*side*2.3};
});
const forest = areas.flatMap((a,zone)=>a.road.slice(1).flatMap(([x,z],leg)=>{
  const [ax,az]=a.road[leg], dx=x-ax,dz=z-az,len=Math.hypot(dx,dz);
  const count = Math.ceil(22/(a.road.length-1));
  return Array.from({length:count},(_,i)=>{
    const side=i%2 ? -1 : 1, offset=14+(i%3)*8;
    return { x:ax+dx*(i+1)/(count+1)-dz/len*side*offset,
      z:az+dz*(i+1)/(count+1)+dx/len*side*offset, zone, hide:i%3!==1,
      approach:{x:ax+dx*(i+1)/(count+1),z:az+dz*(i+1)/(count+1)} };
  });
}).slice(0,22));
const residents = [
  ...shelters.map(s=>({...s.innerGuard,zone:s.zone,hide:true,shelter:s.id,
    patrol:[s.innerGuard,{x:s.x,z:s.z-s.sign*1.5}]})),
  ...shelters.filter(s=>s.second).map(s=>({...s.outerGuard,zone:s.zone,hide:true,shelter:s.id})),
  ...forest.filter(p=>p.x>8&&p.z>8&&p.x<712&&p.z<712),
].map((p,i)=>({...p,id:'resident-'+(i+1),kind:i%13===12?'brute':i%5===4?'shrieker':'shambler',
  yaw:(i*2.399)%(Math.PI*2),patrol:p.patrol??[p,{x:p.x+Math.cos(i)*4,z:p.z+Math.sin(i)*4}]}));

export const PLATEAU = { size:PLATEAU_SIZE, areas,shelters,tracks,starts,props,residents,supplies };

export function shelterLamp(site) {
  return {x:site.x+1.38*site.sign,z:site.z-(site.d/2+.77)*site.sign};
}

export function nearestPlateauTrack(x,z) {
  let best=null, gap=Infinity;
  for (const track of tracks) {
    const at=projection(x,z,track), d=(x-at.x)**2+(z-at.z)**2;
    if (d<gap) { best=at; gap=d; }
  }
  return best;
}

export function plateauRoad(x,z) {
  let best=Infinity;
  for (const [ax,az,bx,bz] of tracks) {
    const dx=bx-ax,dz=bz-az;
    const t=Math.min(1,Math.max(0,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    const d=(x-ax-dx*t)**2+(z-az-dz*t)**2;
    if (d<best) best=d;
  }
  return Math.sqrt(best);
}

export function plateauRegion(x,z) {
  let nearest=areas[0], best=Infinity;
  for (const area of areas) {
    const gap=Math.hypot(x-area.hill[0],z-area.hill[1]);
    if (gap<best) { best=gap; nearest=area; }
  }
  return nearest.biome;
}

export function plateauGround(x,z) {
  const edge=Math.min(x,z,PLATEAU_SIZE-x,PLATEAU_SIZE-z);
  return 4 + Math.sin(x*.039)*Math.cos(z*.037)*1.5 + areas.reduce((height,{hill:[cx,cz,peak,r]})=>
    height + peak*Math.exp(-((x-cx)**2+(z-cz)**2)/(r*r)),0) - Math.max(0,-edge)*.92;
}

const wallColors=[0x76624a,0x70483c,0x4e6457,0x535d6a,0x796e55];
export function buildPlateauShelter(site,area,height,box) {
  const {x,z,w,d,sign,rooms,palette,roof,porch}=site;
  const base=height(x,z)-.12, h=2.65, color=wallColors[palette];
  const at=(dx,dz)=>({x:x+dx*sign,z:z+dz*sign});
  const wall=(dx,dz,width,depth,kind='districtWall',y=base,tall=h,tint=color)=>{
    const p=at(dx,dz);
    return box(p.x,p.z,width,tall,depth,y,kind,tint);
  };
  function divided(dz,door) {
    const gap=1.9, left=door-gap/2+w/2, right=w/2-door-gap/2;
    wall(-w/2+left/2,dz,left,.2);
    wall(w/2-right/2,dz,right,.2);
    wall(door,dz,gap,.2,'districtLintel',base+2.12,h-2.12);
  }
  divided(-d/2,0);
  divided(0,-w*.19);
  if (rooms===3) {
    wall(.15,d*.12,.20,d*.24);
    wall(.15,d*.44,.20,d*.12);
  }
  wall(0,d/2,w,.24);
  for (const side of [-1,1]) {
    wall(side*w/2,-d*.34,.23,d*.32);
    wall(side*w/2,d*.35,.23,d*.30);
    wall(side*w/2,.01*d,.23,d*.38,'districtWall',base,.96);
    wall(side*w/2,.01*d,.23,d*.38,'districtLintel',base+1.92,h-1.92);
  }
  if (roof===0) {
    wall(0,0,w+.65,d+.6,'shedRoof',base+h+.16,.16,0x434940).slope=.07*sign;
  } else if (roof===1) {
    for (const side of [-1,1])
      wall(side*w/4,0,w/2+.5,d+.55,'shedRoof',base+h+.18,.16,0x4f473b).slope=-side*.13*sign;
  } else {
    wall(0,0,w+.46,d+.45,'shedRoof',base+h+.07,.15,0x515452);
    wall(0,d*.17,w*.64,d*.54,'shedRoof',base+h+.35,.18,0x55504a);
  }
  if (porch) {
    wall(.30,-d/2-1.05,w*.80,2.05,'shedRoof',base+2.34,.11,0x51483b);
    for (const side of [-1,1])
      wall(.30+side*w*.35,-d/2-1.97,.16,.16,'districtPost',base,2.37,0x574837);
  }
  wall(-w*.38,d*.38,.66,.53,'districtCrate',base,.73,0x606656);
  wall(w*.41,-d*.33,.64,.78,'districtCrate',base,palette%2?1.69:.68,0x494d3b);
  if (palette>1) wall(w*.39,d*.21,.52,.76,'districtCrate',base,.81,0x655749);
  const lantern=shelterLamp(site);
  area.lights.push({type:'lantern',...lantern,y:base+1.82,ray:{x:0,y:-.83,z:-sign*.558},radius:8,angle:.71});
  area.buildings.push(site);
}
