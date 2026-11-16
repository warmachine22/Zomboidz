import { activeBeams, flarePower, hordeTarget } from './simulation.js';
import { direction, distance } from './world.js';

export function drawDebug(canvas, text, run) {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas, { player: p, world } = run;
  const scale = w / 84;
  const atX = x => w / 2 + (x - p.x) * scale;
  const atZ = z => h / 2 + (z - p.z) * scale;
  function circle(x, z, r, color, stroke = false) {
    g.beginPath(); g.arc(atX(x), atZ(z), r * scale, 0, Math.PI * 2);
    if (stroke) { g.strokeStyle = color; g.stroke(); }
    else { g.fillStyle = color; g.fill(); }
  }
  function line(x, z, x2, z2, color) {
    g.beginPath(); g.moveTo(atX(x), atZ(z)); g.lineTo(atX(x2), atZ(z2)); g.strokeStyle = color; g.stroke();
  }
  g.fillStyle = '#101a19'; g.fillRect(0, 0, w, h);
  for (const { origin, ray, range, angle } of activeBeams(run)) {
    const yaw = Math.atan2(ray.x, -ray.z);
    g.beginPath(); g.moveTo(atX(origin.x), atZ(origin.z));
    for (let i = 0; i <= 25; i++) {
      const v = direction(yaw + angle * (i / 12.5 - 1));
      const d = world.raycast(origin, { x:v.x, y:0, z:v.z }, range, false)?.t ?? range;
      g.lineTo(atX(origin.x + v.x * d), atZ(origin.z + v.z * d));
    }
    g.closePath(); g.fillStyle = '#fae5a535'; g.fill();
  }
  for (const area of world.around(p.x, p.z, 48)) {
    for (const o of area.colliders) {
      if (o.r) circle(o.x, o.z, o.r, '#607367');
      else { g.fillStyle = '#606c67'; g.fillRect(atX(o.x - o.rx), atZ(o.z - o.rz), o.rx*scale*2, o.rz*scale*2); }
    }
  }
  for (const n of run.noises) {
    const opacity = Math.max(0, (1 - (run.time - n.born) / n.span) * .64);
    circle(n.origin.x, n.origin.z, n.radius, n.kind === 'gunshot' ? 'rgba(237,142,112,' + opacity + ')'
      : 'rgba(133,191,182,' + opacity + ')', true);
  }
  for (const item of run.loot) {
    if (item.lost || distance(item, p) > 48) continue;
    circle(item.x, item.z, item.kind === 'ammo' ? .44 : .72, item.kind === 'ammo' ? '#b1c0b9' : '#efb37c');
    if (item.kind !== 'ammo') {
      const power = flarePower(run.time - item.born);
      if (power > 0) circle(item.x, item.z, 17 * Math.sqrt(power), 'rgba(230,172,106,' + power * .72 + ')', true);
    }
  }
  for (const e of run.enemies) {
    const color = e.reason === 'loot flare' ? '#f5b264' : e.target?.chase ? '#ff8069' : '#91b397';
    if (e.route) line(e.x, e.z, e.route.x, e.route.z, color + '87');
    if (e.target) {
      g.setLineDash([2, 2]); line(e.x, e.z, e.target.x, e.target.z, color + '5f'); g.setLineDash([]);
    }
    circle(e.x, e.z, e.kind === 'brute' ? .66 : .48, color);
    if (distance(p, e) < 21) {
      g.font = '8px monospace'; g.fillStyle = color;
      g.fillText(e.kind[0] + ' ' + e.reason, atX(e.x) + 3, atZ(e.z) - 3);
    }
  }
  const f = direction(p.yaw);
  circle(p.x, p.z, .85, '#dcebbb');
  line(p.x, p.z, p.x+f.x*3, p.z+f.z*3, '#dcebbb');
  text.textContent = 'Seed ' + run.seed + ' · crowd ' + run.enemies.length + '/' + Math.min(run.crowdLimit, hordeTarget(run.time))
    + '\nGreen roaming · red pursuing · amber diverted\nM closes this view';
}
