import { RADIO_PARTS } from './campaign.js';
import { direction } from './world.js';

export function drawFieldMap(ctx, run, x, y, width, height) {
  const {campaign,world,player}=run, map=world.map;
  const size=Math.min(height,width*.70), factor=size/map.size, legend=x+size+18;
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle='#222e28';
  ctx.fillRect(0,0,size,size);
  ctx.save();
  ctx.scale(factor,factor);
  const colors=['#303c35','#283a30','#263938','#3b3d2f','#353832'];
  for (const [i,area] of map.areas.entries()) {
    const [ax,az,,radius]=area.hill;
    ctx.fillStyle=colors[i];
    ctx.beginPath();
    ctx.ellipse(ax,az,radius,radius*.78,0,0,2*Math.PI);
    ctx.fill();
  }
  ctx.lineWidth=3.6;
  for (const [i,[ax,az,bx,bz]] of map.tracks.entries()) {
    const spur=i>=map.tracks.length-map.shelters.length;
    ctx.strokeStyle=spur?'#768072':'#bab297';
    ctx.setLineDash(spur?[5,7]:[]);
    ctx.beginPath();
    ctx.moveTo(ax,az);
    ctx.lineTo(bx,bz);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle='#b48d63';
  ctx.strokeRect(4,4,map.size-8,map.size-8);
  for (const site of map.shelters) if (campaign.visited.has(site.id)) {
    ctx.fillStyle='#f7bc64';
    ctx.fillRect(site.x-6,site.z-6,12,12);
  }
  const bearing=direction(player.yaw);
  ctx.translate(player.x,player.z);
  ctx.rotate(Math.atan2(bearing.z,bearing.x)+Math.PI/2);
  ctx.fillStyle='#b6f0c9';
  ctx.strokeStyle='#182621';
  ctx.beginPath();
  ctx.moveTo(0,-15);
  ctx.lineTo(9,9);
  ctx.lineTo(0,5);
  ctx.lineTo(-9,9);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle='#d8e5cb';
  ctx.font='bold '+Math.max(13,Math.floor(size*.046))+'px sans-serif';
  ctx.fillText('N ↑',9,23);
  ctx.fillText('Radio '+campaign.parts.size+'/5',legend-x,30,width-size-22);
  ctx.font=Math.max(11,Math.floor(size*.039))+'px sans-serif';
  for (const [i,name] of RADIO_PARTS.entries()) {
    const found=campaign.parts.has(i);
    ctx.fillStyle=found?'#f6c27c':'#9aaf9f';
    ctx.fillText((found?'✓ ':'○ ')+name,legend-x,62+i*size*.081,width-size-22);
  }
  ctx.fillStyle='#f6c27c';
  ctx.fillText('■ Entered shelters',legend-x,size-30,width-size-22);
  ctx.fillStyle='#b6f0c9';
  ctx.fillText('▲ Your position',legend-x,size-9,width-size-22);
  ctx.restore();
}
