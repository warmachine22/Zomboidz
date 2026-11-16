export const CHUNK = 48;
export const START = { x: 0, z: 20 };
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const direction = yaw => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });

export function hash(value) {
  let h = 2166136261;
  for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function random(seed) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function rayBox(origin, ray, box, max) {
  let near = 0, far = max;
  for (const axis of ['x', 'y', 'z']) {
    const lo = box[axis] - box['r' + axis];
    const hi = box[axis] + box['r' + axis];
    if (Math.abs(ray[axis]) < 1e-7) {
      if (origin[axis] < lo || origin[axis] > hi) return Infinity;
      continue;
    }
    const first = (lo - origin[axis]) / ray[axis];
    const last = (hi - origin[axis]) / ray[axis];
    near = Math.max(near, Math.min(first, last));
    far = Math.min(far, Math.max(first, last));
    if (near > far) return Infinity;
  }
  return near;
}

function rayTrunk(origin, ray, trunk, max) {
  const dx = origin.x - trunk.x, dz = origin.z - trunk.z;
  const a = ray.x ** 2 + ray.z ** 2;
  const b = dx * ray.x + dz * ray.z;
  const c = dx * dx + dz * dz - trunk.r ** 2;
  const d = b * b - a * c;
  if (a < 1e-7 || d < 0 || (b > 0 && c > 0)) return Infinity;
  let near = Math.max(0, (-b - Math.sqrt(d)) / a);
  let far = Math.min(max, (-b + Math.sqrt(d)) / a);
  if (near > far) return Infinity;
  const localY = origin.y - trunk.y;
  if (Math.abs(ray.y) > 1e-7) {
    const capA = -localY / ray.y, capB = (trunk.height - localY) / ray.y;
    near = Math.max(near, Math.min(capA, capB));
    far = Math.min(far, Math.max(capA, capB));
  } else if (localY < 0 || localY > trunk.height) return Infinity;
  if (near > far) return Infinity;
  // Clip against the nine planes of the visible tree, including its taper.
  const support = trunk.r * Math.cos(Math.PI / 9);
  const taper = support * .5 / trunk.height;
  for (const n of trunk.normals) {
    const delta = n.x * dx + n.z * dz + taper * localY - support;
    const speed = n.x * ray.x + n.z * ray.z + taper * ray.y;
    if (Math.abs(speed) < 1e-7) {
      if (delta > 0) return Infinity;
    } else {
      const t = -delta / speed;
      if (speed < 0) near = Math.max(near, t);
      else far = Math.min(far, t);
      if (near > far) return Infinity;
    }
  }
  return near;
}

function polylineOffset(n) {
  return 2.1 * Math.sin(n * 0.024) + 1.25 * Math.sin(n * 0.055);
}

export function createWorld(seed) {
  const chunks = new Map();
  const phase = random(seed + ':land')() * 7;
  const density = (x, z) => clamp(.51 + .31*Math.sin(x*.037+z*.023+phase)
    + .23*Math.sin(z*.061-x*.047-phase), .03, .98);

  const roadDistance = (x, z) => {
    const u = x - polylineOffset(z);
    const v = z - 87 - polylineOffset(x);
    return Math.min(Math.abs(u - Math.round(u / 126) * 126),
      Math.abs(v - Math.round(v / 154) * 154));
  };
  const sample = (x, z) => {
    const offRoad = clamp((roadDistance(x, z) - 1.9) / 9, 0, 1);
    const hills = Math.sin(x * .049 + phase) * Math.cos(z * .042 - phase) * 1.55
      + Math.sin(z * .099 + x * .061) * .36;
    return hills * (.42 + offRoad * .58) + Math.sin(x * .29 + z * .22) * .10 * offRoad;
  };
  // Same triangles used by the terrain mesh. Heights agree between neighbouring chunks.
  const height = (x, z) => {
    const x0 = Math.floor(x / 2) * 2, z0 = Math.floor(z / 2) * 2;
    const u = (x - x0) / 2, v = (z - z0) / 2;
    if (u + v <= 1) return sample(x0, z0) * (1 - u - v) + sample(x0 + 2, z0) * u + sample(x0, z0 + 2) * v;
    return sample(x0 + 2, z0 + 2) * (u + v - 1) + sample(x0, z0 + 2) * (1 - u) + sample(x0 + 2, z0) * (1 - v);
  };
  const makeChunk = (cx, cz) => {
    const key = cx + ',' + cz;
    const rng = random(seed + ':chunk:' + key);
    const left = cx * CHUNK, top = cz * CHUNK;
    const area = { key, cx, cz, trees: [], plants: [], props: [], colliders: [], loot: [], entrances: [], lights: [] };
    const sites = [];

    const box = (x, z, w, h, d, base = height(x, z), kind = 'stone') => {
      const item = { x, z, y: base + h / 2, rx: w / 2, ry: h / 2, rz: d / 2, kind };
      area.colliders.push(item);
      area.props.push(item);
    };
    const cache = (id, x, z, kind, unlock = 0) => {
      area.loot.push({ id: key + ':' + id, x, z, kind, unlock });
    };
    const site = (type, x, z, lit = false) => {
      sites.push({ x, z, r: type === 'house' || type === 'camp' ? 7 : type === 'shed' ? 5.8 : 4 });
      if (type === 'house') {
        const y = height(x, z) - .17;
        box(x, z - 2.5, 6.5, 2.7, .38, y, 'houseBack');
        box(x - 3.05, z - .65, .42, 2.55, 3.8, y, 'houseSide');
        box(x + 3.05, z + .35, .42, 1.68, 2.7, y, 'houseSide');
        box(x + 1.8, z + 2.45, 2.6, 2.45, .35, y, 'houseFront');
        box(x - 2.5, z + 2.45, 1.4, 1.9, .35, y, 'houseFront');
        area.props.push({ x, z, y, kind: 'rafters' });
        if (lit) area.lights.push({ type:'shelter', x:x-1.1, y:y+2.40, z:z-.8,
          ray:{ x:0,y:-.98,z:.20 }, radius:5.6, angle:.83 });
        cache('inside', x + 1.05, z - 1.05, rng() > .55 ? 'smg' : 'armor2', 42);
        cache('porch', x - .7, z + 3.5, 'ammo', 16);
      } else if (type === 'shed') {
        const y = height(x,z)-.14;
        box(x,z+1.7,3.7,2.25,.25,y,'shedWall');
        box(x-1.76,z,.22,2.17,3.5,y,'shedWall');
        box(x+1.76,z,.22,2.17,3.5,y,'shedWall');
        box(x-1.38,z-1.7,.95,2.08,.20,y,'shedWall');
        box(x+1.38,z-1.7,.95,2.08,.20,y,'shedWall');
        box(x,z+.06,3.92,.13,3.8,y+2.225,'shedRoof');
        if (lit) area.lights.push({type:'shelter',x:x-.5,y:y+2.1,z:z+.47,
          ray:{x:0,y:-.98,z:-.2},radius:4.8,angle:.80});
        cache('shed-supplies',x+.62,z+.85,hash(seed+key)%4===0?'battery':'ammo',30);
      } else if (type === 'camp') {
        const y = height(x,z);
        area.props.push({x,y,z,kind:'firepit'});
        for (const sign of [-1,1]) {
          const tx=x+sign*2.8, tz=z-1.4+sign*.45, ty=height(tx,tz)-.04;
          area.props.push({x:tx,y:ty,z:tz,kind:'campTent',turn:sign*.41});
          box(tx,tz+.56,1.10,.27,.89,ty,'tentBody');
        }
        box(x+2.76,z+1.31,.94,1.29,.88,height(x+2.76,z+1.31),'campCrates');
        box(x+1.65,z+1.75,.81,.63,.67,height(x+1.65,z+1.75),'campCrates');
        if (hash(seed+'camp-cache'+key)%4 !== 0) cache('camp-kit',x+1.85,z+1.03,'ammo',18);
      } else if (type === 'wreck') {
        const y = height(x, z)-.16;
        box(x, z, 1.86, 1.48, 3.85, y, 'wreck');
        if (lit) for (const side of [-1, 1]) {
          area.lights.push({ type:'wreck', x:x+side*.64, y:y+.73, z:z+1.95,
            ray:{ x:side*.025, y:-.13, z:.9912 }, radius:18, angle:.62 });
        }
        cache('trunk', x - 1.65, z + .7, 'shotgun', 27);
        cache('road', x - 2.3, z + 4.8, 'ammo', 12);
      } else {
        for (let i = 0; i < 5; i++) {
          const px = x + (i % 2 ? 1 : -1) * (1.5 + rng()), pz = z + (i - 2) * 2.6;
          const size = .95 + rng() * 1.45;
          box(px, pz, size * 1.7, size * (1.03 + rng() * .5), size * 1.36);
        }
        cache('rocks', x, z - 3.3, rng() > .5 ? 'pierce' : 'reload', 34);
      }
    };
    if (cx === 0 && cz === 0) site('wreck', 3.8, 5.4, true);
    else if (cx === 0 && cz === -1) site('house', 12, -18, true);
    else if (cx === -1 && cz === 0) site('rocks', -11, 7);
    else if (rng() < .32) site(['house', 'wreck', 'rocks'][Math.floor(rng() * 3)],
      left + 10 + rng() * 28, top + 10 + rng() * 28, hash(seed+':lit:'+key) % 5 === 0);
    const fieldSite = random(seed + ':field-site:' + key);
    if (Math.abs(cx)+Math.abs(cz)>1 && fieldSite() < .29) {
      for (let i=0; i<5; i++) {
        const x=left+10+fieldSite()*28, z=top+10+fieldSite()*28;
        if (roadDistance(x,z)<6 || sites.some(s=>distance(s,{x,z}) < s.r+8)) continue;
        site(fieldSite() < .55 ? 'camp' : 'shed',x,z,fieldSite()<.18);
        break;
      }
    }

    for (let i = 0; i < 152; i++) {
      const x = left + 1.7 + rng() * (CHUNK - 3.4), z = top + 1.7 + rng() * (CHUNK - 3.4);
      const thick = density(x,z);
      const roll = rng(), elder = roll < .075 + thick*.075;
      const r = elder ? .65+rng()*.37 : roll > .82 ? .11+rng()*.11 : .19+rng()*.37;
      if (roadDistance(x, z) < 2.8 || Math.hypot(x - START.x, z - START.z) < 8 ||
          rng() > .41 + thick*.54 ||
          sites.some(s => Math.hypot(x - s.x, z - s.z) < s.r) ||
          area.trees.some(t => Math.hypot(x - t.x, z - t.z) < Math.max(1.84,r+t.r+1.10))) continue;
      const type = Math.floor(rng() * 4), heightScale = elder ? 12.5+rng()*4.6 : 4.8+r*12+rng()*3.3;
      const crown = (elder ? 3.56 : 1.62) + r*(1.4+thick*.7) + rng()*.74;
      const tree = { x, z, y: height(x, z) - .12, r, height: heightScale, crown, thick,
        turn: rng() * Math.PI * 2, tint: rng(), type, kind: 'bark' };
      tree.normals = Array.from({ length: 9 }, (_, j) => {
        const angle = tree.turn + (j + .5) * Math.PI * 2 / 9;
        return { x: Math.sin(angle), z: Math.cos(angle) };
      });
      area.trees.push(tree);
      area.colliders.push(tree);
    }
    for (let i = 0; i < 104; i++) {
      const x = left + rng() * CHUNK, z = top + rng() * CHUNK;
      const road = roadDistance(x, z);
      if (road < 1.95 || sites.some(s => Math.hypot(x - s.x, z - s.z) < s.r * .8)) continue;
      area.plants.push({ x, z, y: height(x, z), size: .26 + rng() ** 2 * 1.08,
        turn: rng() * Math.PI * 2, tint: rng(), brush: i % 3 === 0 });
    }
    // These candidate approaches are regenerated and checked for line of sight at use.
    for (let i = 0; i < 20; i++) {
      const x = left + 3 + rng() * 42, z = top + 3 + rng() * 42;
      if (area.colliders.every(o => Math.hypot(x - o.x, z - o.z) > (o.r || Math.max(o.rx, o.rz)) + .6))
        area.entrances.push({ x, z });
    }
    return area;
  };

  function chunk(cx, cz) {
    const key = cx + ',' + cz;
    let value = chunks.get(key);
    if (!value) {
      value = makeChunk(cx, cz);
      chunks.set(key, value);
      if (chunks.size > 120) {
        for (const old of chunks.values()) {
          if (Math.abs(old.cx - cx) + Math.abs(old.cz - cz) > 7) chunks.delete(old.key);
          if (chunks.size <= 86) break;
        }
      }
    }
    return value;
  }

  function around(x, z, radius) {
    const result = [];
    for (let j = Math.floor((z - radius) / CHUNK); j <= Math.floor((z + radius) / CHUNK); j++)
      for (let i = Math.floor((x - radius) / CHUNK); i <= Math.floor((x + radius) / CHUNK); i++)
        result.push(chunk(i, j));
    return result;
  }

  function blocks(x, z, radius = .26) {
    return around(x, z, radius + 3.5).some(area => area.colliders.some(o => {
      if (o.kind === 'shedRoof') return false;
      if (o.r) return (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + radius) ** 2;
      const dx = Math.max(0, Math.abs(x - o.x) - o.rx), dz = Math.max(0, Math.abs(z - o.z) - o.rz);
      return dx * dx + dz * dz < radius * radius;
    }));
  }

  function move(point, dx, dz, radius) {
    if (!blocks(point.x + dx, point.z + dz, radius)) {
      point.x += dx;
      point.z += dz;
    } else {
      if (!blocks(point.x + dx, point.z, radius)) point.x += dx;
      if (!blocks(point.x, point.z + dz, radius)) point.z += dz;
    }
  }

  function raycast(origin, ray, range, ground = true) {
    const endX = origin.x + ray.x * range, endZ = origin.z + ray.z * range;
    let t = range + 1, object = null;
    // Pad by the largest cover footprint because authored props can straddle a chunk edge.
    for (let j = Math.floor((Math.min(origin.z, endZ) - 3.5) / CHUNK); j <= Math.floor((Math.max(origin.z, endZ) + 3.5) / CHUNK); j++) {
      for (let i = Math.floor((Math.min(origin.x, endX) - 3.5) / CHUNK); i <= Math.floor((Math.max(origin.x, endX) + 3.5) / CHUNK); i++) {
        for (const o of chunk(i, j).colliders) {
          const hit = o.r ? rayTrunk(origin, ray, o, Math.min(t, range))
            : rayBox(origin, ray, o, Math.min(t, range));
          if (hit < t && hit <= range) { t = hit; object = o; }
        }
      }
    }
    if (ground) {
      const limit = Math.min(t, range);
      for (let d = Math.min(.65, limit); d <= limit && d > 0; d = Math.min(d + .65, limit)) {
        const x = origin.x + ray.x * d, z = origin.z + ray.z * d;
        if (origin.y + ray.y * d <= height(x, z)) {
          let low = Math.max(0, d - .65), high = d;
          for (let i = 0; i < 6; i++) {
            const mid = (low + high) / 2;
            if (origin.y + ray.y * mid > height(origin.x + ray.x * mid, origin.z + ray.z * mid)) low = mid;
            else high = mid;
          }
          return { t: high, kind: 'earth' };
        }
        if (d === limit) break;
      }
    }
    return object ? { t, kind: object.kind } : null;
  }

  function clear(a, b, ground = true) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    return len <= .14 || !raycast(a, { x: dx / len, y: dy / len, z: dz / len }, len - .12, ground);
  }

  return { seed, height, sample, density, roadDistance, chunk, around, blocks, move, raycast, clear };
}
