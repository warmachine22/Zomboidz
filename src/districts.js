const layouts = [
  { name: 'workshop', w:4.8, d:5.2, h:2.35, shed:true, roof:'gable' },
  { name: 'split shed', w:5.8, d:4.6, h:2.3, shed:true, roof:'broken' },
  { name: 'lean-to', w:4.8, d:6.3, h:2.45, shed:true, roof:'lean' },
  { name: 'porch cabin', w:6.5, d:6, h:2.58, shed:false, roof:'gable' },
  { name: 'two-room cabin', w:7.8, d:6.5, h:2.62, shed:false, roof:'lean' },
];
const palettes = [
  { wall:0x9c5043, roof:0x58494a }, { wall:0x718375, roof:0x6e6f60 },
  { wall:0xb3a782, roof:0x725d51 }, { wall:0x6e8191, roof:0x534c56 },
  { wall:0xa98958, roof:0x545d54 },
];

export function makeDistrict(seed, cx, cz, chunk, random) {
  const size = chunk * 12, rng = random(seed + ':district:' + cx + ',' + cz);
  const left = cx * size, top = cz * size;
  const x0 = left + 19 + rng()*11, z0 = top + chunk * (1 + Math.floor(rng()*2)) + 21 + rng()*7;
  const x1 = x0 + chunk * (2 + Math.floor(rng()*2)), x2 = x1 + chunk * (2 + Math.floor(rng()*2));
  const z1 = z0 + chunk * (2 + Math.floor(rng()*2));
  const spine = rng() < .5 ? x0 - 12 : x2 + 12;
  const west = left + 1, east = x2 + 17;
  // The first district sits along the opening road, past the roadside ruin.
  const mirrored = cx === 0 && cz === -1;
  const reflect = z => mirrored ? 2*top + size - z : z;
  const tracks = [[west,reflect(z0),east,reflect(z0)], [west,reflect(z1),east,reflect(z1)],
    [spine,Math.min(reflect(z0),reflect(z1)),spine,Math.max(reflect(z0),reflect(z1))]];
  const buildings = new Map(), looks = new Set();
  const shedOrder = [0,1,2,Math.floor(rng()*3)];
  const order = [shedOrder[0],3,shedOrder[1],shedOrder[2],4,shedOrder[3]];
  if (rng() < .5) order.reverse();
  for (const [row, z] of [z0,z1].entries()) for (const [column, x] of [x0,x1,x2].entries()) {
    const index = row * 3 + column, layout = order[index];
    let palette = Math.floor(rng()*palettes.length);
    while (looks.has(layout + ':' + palette)) palette = (palette + 1) % palettes.length;
    looks.add(layout + ':' + palette);
    const site = { id: 'district:' + cx + ',' + cz + ':' + index, x, z: reflect(z + (row ? -8 : 8)),
      turn: Boolean(row) !== mirrored ? 2 : 0, layout, palette };
    buildings.set(Math.floor(x/chunk) + ',' + Math.floor(site.z/chunk), site);
  }
  return { buildings, tracks };
}

export function trackDistance(x, z, tracks) {
  let nearest = Infinity;
  for (const [ax,az,bx,bz] of tracks) {
    const dx = Math.max(ax-x, 0, x-bx), dz = Math.max(az-z, 0, z-bz);
    nearest = Math.min(nearest, Math.hypot(dx,dz) + .38);
  }
  return nearest;
}

export function buildDistrictSite(entry, area, height, box, random, wreck) {
  const layout = layouts[entry.layout], palette = palettes[entry.palette];
  const { w, d, h } = layout, sign = entry.turn === 2 ? -1 : 1;
  const y = height(entry.x,entry.z) - .16;
  const at = (x, z) => ({ x: entry.x + x*sign, z: entry.z + z*sign });
  const wall = (x,z,width,height,depth,base=y,kind='districtWall', tint=palette.wall) => {
    const point = at(x,z);
    return box(point.x,point.z,width,height,depth,base,kind,tint);
  };
  const trim = (x,z,w,h,d,base) => area.props.push({
    ...at(x,z), y:base+h/2, rx:w/2, ry:h/2, rz:d/2, kind:'districtTrim', tint:0x615d50,
  });
  const rng = random(entry.id + ':' + entry.x + ':' + entry.palette);
  const door = entry.layout === 2 ? -.63 : entry.layout === 3 ? .64 : 0;
  const opening = 1.85;
  const frontLeft = door - opening/2 + w/2, frontRight = w/2 - door - opening/2;
  wall(-w/2+frontLeft/2,-d/2,frontLeft,h,.22);
  wall(w/2-frontRight/2,-d/2,frontRight,h,.22);
  wall(door,-d/2,opening,h-2.03,.22,y+2.03,'districtLintel');
  for (const side of [-1,1]) trim(door+side*(opening/2+.06),-d/2-.13,.12,2.09,.10,y);
  wall(entry.layout === 1 ? w*.17 : 0,d/2,entry.layout === 1 ? w*.66 : w,h,.23);
  for (const side of [-1,1]) {
    const x=side*w/2;
    wall(x,-d*.34,.22,h,d*.32);
    wall(x,d*.36,.22,h,d*.28);
    wall(x,.02*d,.22,.88,d*.40);
    wall(x,.02*d,.22,h-1.79,d*.40,y+1.79,'districtLintel');
    trim(x,.02*d,.32,.095,d*.42,y+.84);
  }
  if (layout.shed) {
    wall(w*.25,.13,w*.36,1.94,.16);
  } else if (entry.layout === 4) {
    wall(-w*.31,.48,w*.38,h,.18);
    wall(w*.31,.48,w*.38,h,.18);
  } else {
    for (const side of [-1,1]) wall(side*w*.43,-d/2-1.60,.15,2.18,.16,y,'districtPost');
    wall(0,-d/2-.82,w+.22,.13,2,y+2.15,'districtRoof',palette.roof);
  }

  const roof = (x,z,width,depth,base,slope) => {
    const item = wall(x,z,width,.15,depth,base,'shedRoof',palette.roof);
    item.slope = slope*sign;
  };
  if (layout.roof === 'lean') roof(0,0,w+.46,d+.47,y+h+.37,.13);
  else {
    roof(-w/4,0,w/2+.36,d+.45,y+h+.24,.22);
    roof(w/4,layout.roof === 'broken' ? -.54 : 0,w/2+.36,d+(layout.roof === 'broken' ? -.65 : .45),y+h+.24,-.22);
    for (const side of layout.roof === 'broken' ? [-1] : [-1,1]) {
      area.props.push({ ...at(0,side*d/2), y:y+h-.04, width:w, height:w*.11+.11,
        kind:'districtGable', tint:palette.wall });
    }
  }
  const desk = at(w*.30,d*.29);
  if (layout.shed) wall(w*.30,d*.29,.84,.79,.50,y,'districtCrate',0x777267);
  const supplies = at(-w*.29,d*.24);
  area.loot.push({ id:entry.id+':supplies',...supplies,
    kind: layout.shed ? 'ammo' : ['ammo','armor1','shotgun','smg','armor2'][entry.palette], unlock:0 });
  if (entry.palette % 2 === 0) {
    const pickup = at(w/2+2.5,.8);
    wreck(pickup.x,pickup.z,false,false);
  } else {
    wall(-w/2-1.35,-d*.17,.91,.72,.89,y,'districtCrate',palette.roof);
    wall(-w/2-.9,d*.22,.86,1.15,1.02,y,'districtCrate',palette.wall);
  }
  if (entry.palette === 2 || entry.palette === 4) {
    const post = -w/2-.7;
    wall(post,-d/2-1,.16,1.65,.17,y,'districtPost',palette.roof);
    trim(post,-d/2-1.10,.72,.30,.05,y+1.26);
  }
  if (entry.palette === 2 || rng() < .11) {
    const light = at(-w*.28,-.32);
    area.lights.push({ type:'shelter',...light,y:y+h-.15,ray:{ x:0,y:-.99,z:.1*sign },radius:5.6,angle:.78 });
  }
  const site = {
    id:entry.id, x:entry.x, z:entry.z, layout:entry.layout, palette:entry.palette, name:layout.name,
    door:at(door,-d/2-.25), inside:at(door,-d/2+.57),
    interior:[at(-w*.32,-d*.28),at(w*.32,-d*.27),at(-w*.30,d*.25),at(.15,d*.33)],
    exterior:[at(-w/2-1.4,d/2+2),at(w/2+1.4,d/2+2.7),at(.7,d/2+4.7),
      at(-w/2-3.4,.24),at(w/2+3.8,-d*.18)],
    radio: layout.shed ? { ...desk, y:y+.91, turn:entry.turn, standing:at(w*.30-.88,d*.29) } : null,
  };
  area.buildings.push(site);
}
