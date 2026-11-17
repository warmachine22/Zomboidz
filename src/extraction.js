import { distance, random } from './world.js';
import { pressureTime } from './difficulty.js';

export const SEARCH_DISTANCE = 12;
export const RADIO_GUARANTEE = 30;
export const RADIO_REPLY = 'Copy. Extraction confirmed.';

export function visitBuildings(run, cap, addEnemy) {
  const { world, player, search } = run;
  const nearby = world.around(player.x,player.z,SEARCH_DISTANCE).flatMap(area => area.buildings || [])
    .filter(site => distance(player,site) <= SEARCH_DISTANCE && !search.visits.has(site.id))
    .sort((a,b) => distance(player,a) - distance(player,b) || a.id.localeCompare(b.id));
  for (const site of nearby) {
    let hasRadio = false;
    if (site.radio) {
      search.sheds++;
      hasRadio = !search.radio && (search.sheds >= RADIO_GUARANTEE || random(run.seed + ':radio:' + site.id)() < 1/25);
      if (hasRadio) search.radio = { ...site.radio, id:site.id, kind:'radio' };
    }
    const rng = random(run.seed + ':encounter:' + site.id);
    const roll = rng();
    const encounter = roll < .41 ? 'empty' : roll < .80 ? 'interior' : 'exterior';
    const spawned = addEncounter(run,site,encounter,rng,cap,addEnemy);
    search.visits.set(site.id,{ hasRadio, encounter, spawned });
  }
}

function addEncounter(run, site, encounter, rng, cap, addEnemy) {
  if (encounter === 'empty') return 0;
  const {world,player,time} = run;
  const capacity = cap - run.enemies.filter(enemy => !enemy.dead).length;
  if (capacity <= 0) return 0;
  const inside = encounter === 'interior';
  const count = Math.min(capacity, inside ? 1 + Math.floor(rng()*3) : 1);
  const head = { x:player.x,y:player.y+player.eyeHeight,z:player.z };
  let spawned = 0;
  for (const point of inside ? site.interior : site.exterior) {
    if (spawned >= count) break;
    const ground = world.height(point.x,point.z);
    if (distance(player,point) < 4 || world.blocks(point.x,point.z,.37) ||
      run.enemies.some(enemy => !enemy.dead && distance(enemy,point) < 1.25) ||
      world.clear(head,{...point,y:ground+1.15}) || world.clear(head,{...point,y:ground+1.76})) continue;
    const kind = pressureTime(run) > run.rules.opening && rng() < .19 ? 'shrieker' : 'shambler';
    const enemy = addEnemy(run,kind,point.x,point.z);
    enemy.approach = { ...(inside ? site.inside : site.door), role:'building', at:time, until:time+19 };
    spawned++;
  }
  return spawned;
}

export function reachableRadio(run) {
  const radio = run.search.radio, p = run.player;
  if (!radio || distance(p,radio) > 1.58) return null;
  return run.world.clear({ x:p.x,y:p.y+p.eyeHeight*.84,z:p.z },radio) ? radio : null;
}
