import { direction, distance } from './world.js';

const eyes = (world, position, height) => ({x:position.x,y:world.height(position.x,position.z)+height,z:position.z});
const threatSight = (world, head, spot, height) =>
  world.clear(head,eyes(world,spot,height*.67)) || world.clear(head,eyes(world,spot,height*.94));
const largeCover = cover => cover.r ? cover.r >= .62
  : ['houseFront','houseSide','houseBack','shedWall','campCrates','wreck'].includes(cover.kind);

export function nextAmbushTime(run, from = run.time) {
  const [low, high] = run.rules.ambush;
  return from + low + run.ambushRng() * (high-low);
}

export function reserveAmbush(run) {
  if (!run.populate || run.time < run.nextAmbush) return;
  const {world,player,time} = run;
  const occupied=run.enemies.filter(e=>e.ambush);
  if (occupied.length>=run.rules.ambushSlots) return;
  const hard=run.rules.ambushSlots>1;
  run.nextAmbush = time + 4;
  const head = eyes(world,player,player.eyeHeight);
  const walkers = run.enemies.filter(e => {
    if (e.dead || e.kind==='brute' || e.ambush || e.attackAge!==undefined || (e.ambushRestUntil??0)>time) return false;
    const gap=distance(e,player);
    return gap>8 && gap<(hard?34:28) && (!e.target?.chase ||
      (hard && gap>12 && !threatSight(world,head,e,1.70)));
  });
  if (!walkers.length) return;
  const moving = Math.hypot(player.travelX,player.travelZ);
  const heading = moving > .42 ? {x:player.travelX/moving,z:player.travelZ/moving} : direction(player.yaw);
  const cover = world.around(player.x,player.z,24).flatMap(area=>area.colliders).filter(largeCover)
    .map(o => {
      const x=o.x-player.x, z=o.z-player.z;
      return { o,d:Math.hypot(x,z),along:x*heading.x+z*heading.z,lateral:Math.abs(x*heading.z-z*heading.x) };
    })
    .filter(({d,along,lateral}) => d>=8 && d<=23 && along>5 && (moving<.42 || lateral<6.8))
    .sort((a,b)=>a.lateral*.85+a.d*.30-(b.lateral*.85+b.d*.30)).slice(0,14);
  for (const {o,d,along} of cover) {
    const nx=(o.x-player.x)/d, nz=(o.z-player.z)/d;
    const depth=o.r ?? Math.min(2.3,Math.abs(nx)*o.rx+Math.abs(nz)*o.rz);
    const width=o.r ?? Math.abs(nz)*o.rx+Math.abs(nx)*o.rz;
    const hide={x:o.x+nx*(depth+.53),z:o.z+nz*(depth+.53)};
    if (world.blocks(hide.x,hide.z,.32) || occupied.some(e=>distance(e.ambush.hide,hide)<9)
      || threatSight(world,head,hide,1.70)) continue;
    for (const side of [-1,1]) {
      const exit={x:hide.x-nz*(width+.52)*side,z:hide.z+nx*(width+.52)*side};
      if (world.blocks(exit.x,exit.z,.34) || !world.clear(eyes(world,hide,.90),eyes(world,exit,.90))) continue;
      const approachLimit=moving>.42 ? Math.min(12,2+Math.max(0,along-4)/moving*1.5) : 11;
      const enemy=walkers.filter(e=>distance(e,hide)<approachLimit &&
        world.clear(eyes(world,e,.9),eyes(world,hide,.9)))
        .sort((a,b)=>distance(a,hide)-distance(b,hide))[0];
      if (!enemy) continue;
      enemy.ambush={stage:'seeking',hide,exit,until:time+19};
      enemy.ambushRestUntil=time+120;
      run.nextAmbush=nextAmbushTime(run);
      run.metrics.ambushes.reserved++;
      return;
    }
  }
}

export function ambushDecision(run, enemy, gap, canSeeBeam) {
  const {ambush} = enemy;
  if (!ambush) return null;
  const {world,player,time} = run;
  const head=eyes(world,player,player.eyeHeight);
  const body=eyes(world,enemy,1.31);
  const around=gap<7 && threatSight(world,head,enemy,1.72);
  const toward=direction(player.yaw);
  const looking=around && ((enemy.x-player.x)*toward.x+(enemy.z-player.z)*toward.z) > gap*.66;
  const heard = type => run.noises.some(event => event.kind===type && event.born+.7>=time &&
    distance(event.origin,enemy) < event.radius*(world.clear(event.origin,body,false)?1:.63));

  if (ambush.stage==='emerging') {
    if (time>=ambush.until || enemy.attackAge!==undefined) delete enemy.ambush;
    else if (!around) return { reason:'emerging from cover', destination:ambush.exit };
    else return { reason:'emerging from cover', destination:player };
    return null;
  }
  if (time>=ambush.until || gap>25 || (ambush.stage==='seeking' && (looking || canSeeBeam))) {
    delete enemy.ambush;
    return null;
  }
  if (ambush.stage==='seeking') {
    if (distance(enemy,ambush.hide)>.51) return { reason:'taking cover', destination:ambush.hide };
    if (threatSight(world,head,enemy,1.72)) { delete enemy.ambush; return null; }
    ambush.stage='holding';
    ambush.until=time+17;
    enemy.nextVoice=Math.min(enemy.nextVoice,time+.13);
  }
  const heardSteps=gap<7.1 && heard('footstep');
  const heardShot=gap<13 && heard('gunshot');
  if (heardShot || looking || canSeeBeam || ((heardSteps || (around && gap<2.4)) && time-enemy.lastVoice < 2.7)) {
    ambush.stage='emerging';
    ambush.until=time+4.5;
    run.metrics.ambushes.emerged++;
    return { reason:'emerging from cover', destination:around?player:ambush.exit };
  }
  return { reason:'waiting behind cover', destination:null };
}
