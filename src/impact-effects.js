import * as THREE from 'three';

const MAX_PARTICLES=72;
const MAX_WOUNDS=12;
const down=new THREE.Vector3(0,-1,0);

export function createImpactEffects(scene) {
  const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),
    new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),MAX_PARTICLES);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  mesh.count=0;
  scene.add(mesh);
  const dummy=new THREE.Object3D(), at=new THREE.Vector3();
  const colors=[0x6d1713,0x9b231b,0xac2b20,0x4b1510,0x704332].map(c=>new THREE.Color(c));
  const particles=Array.from({length:MAX_PARTICLES},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),left:0}));
  const wounds=[];
  let cursor=0;

  function drop(position,velocity,radius,life,floor,color) {
    const p=particles[cursor++%MAX_PARTICLES];
    p.position.copy(position);
    p.velocity.set(...velocity);
    Object.assign(p,{radius,life,left:life,floor,color});
  }

  function impact(event,actor,world,quality,reduced) {
    at.set(event.x,event.y,event.z);
    const floor=world.height(at.x,at.z)+.015;
    const ray=event.ray??down;
    const amount=event.rupture?(reduced?10:quality>1?25:16):reduced?4:quality>1?9:6;
    for (let i=0;i<amount;i++) {
      const scatter=event.rupture?4:1.55;
      const fragment=event.rupture && i<amount/4;
      drop(at,[
        (Math.random()-.5)*scatter-ray.x*1.1, Math.random()*scatter+.38-ray.y*.6,
        (Math.random()-.5)*scatter-ray.z*1.1,
      ],fragment ? .024+Math.random()*.019 : .010+Math.random()*.017,
      (fragment?.40:.21)+Math.random()*.28,floor,fragment?4:i%4);
    }
    if (!actor || reduced && !event.rupture) return;
    actor.root.updateMatrixWorld(true);
    const joints=event.anchors?.map(i=>actor.anchorBones?.[i]).filter(Boolean)??[];
    const source=event.rupture?actor.neck:joints.reduce((best,bone)=>!best ||
      bone.getWorldPosition(new THREE.Vector3()).distanceToSquared(at)<
      best.getWorldPosition(new THREE.Vector3()).distanceToSquared(at)?bone:best,null)??actor.root;
    if (!source) return;
    const position=event.rupture?new THREE.Vector3(0,.07,0):source.worldToLocal(at.clone());
    if (wounds.length>=MAX_WOUNDS) wounds.shift();
    wounds.push({actor,source,position,left:event.rupture?.68:1.04,next:.04,floor});
  }

  function update(dt,quality) {
    let count=0;
    for (let i=wounds.length-1;i>=0;i--) {
      const wound=wounds[i];
      wound.left-=dt; wound.next-=dt;
      if (wound.left<=0) { wounds.splice(i,1); continue; }
      if (wound.next>0) continue;
      wound.next+=quality>1?.078:.15;
      at.copy(wound.position);
      wound.source.localToWorld(at);
      drop(at,[(Math.random()-.5)*.18,-.34,(Math.random()-.5)*.18],.014+Math.random()*.013,.34,wound.floor,1);
    }
    for (const p of particles) {
      if (p.left<=0) continue;
      p.left-=dt;
      p.velocity.y-=dt*8;
      p.position.addScaledVector(p.velocity,dt);
      if (p.left<=0 || p.position.y<p.floor) { p.left=0; continue; }
      const size=p.radius*Math.min(1,p.left/p.life*2.6);
      dummy.position.copy(p.position);
      dummy.scale.set(size,size*(1.15+Math.min(.65,Math.abs(p.velocity.y)*.16)),size);
      dummy.updateMatrix();
      mesh.setMatrixAt(count,dummy.matrix);
      mesh.setColorAt(count++,colors[p.color]);
    }
    mesh.count=count;
    if (count) {
      mesh.instanceMatrix.needsUpdate=true;
      mesh.instanceColor.needsUpdate=true;
    }
  }

  return {impact,update,
    release(actor) { for (let i=wounds.length-1;i>=0;i--) if (wounds[i].actor===actor) wounds.splice(i,1); },
    reset() { wounds.length=0;for (const p of particles) p.left=0;mesh.count=0; },
  };
}
