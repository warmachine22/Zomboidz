import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = id => document.getElementById(id);
const immersiveStyles=document.createElement('style');immersiveStyles.textContent='body.playing #hud,body.playing #battery,body.playing #elims,body.playing #topbar{display:none!important}body.playing .grain{opacity:.035}body.playing #VRButton{bottom:16px!important;opacity:.28!important}';document.head.appendChild(immersiveStyles);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rnd=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
const fmt=s=>{s=Math.floor(Math.max(0,s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const scene=new THREE.Scene();scene.background=new THREE.Color(0x010203);scene.fog=new THREE.FogExp2(0x010303,.064);
const camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.06,110);camera.position.set(0,1.63,0);camera.rotation.order='YXZ';
const rig=new THREE.Group();scene.add(rig);rig.add(camera);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');$('world').appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));
scene.add(new THREE.AmbientLight(0x354638,.024));
function makeForestFloor(){
 const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
 const p=['#2e3028','#35322b','#3d362c','#473c2e','#302a27','#3d412c','#334029','#4a3d30','#292e25'];
 for(let y=0;y<256;y+=8)for(let x=0;x<256;x+=8){
  g.fillStyle=pick(p);g.fillRect(x,y,8,8);
  if(Math.random()<.14){g.fillStyle=pick(['#615039','#41472b','#2d3a2a']);g.fillRect(x+4,y,4,4);}
 }
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(156,156);
 return tex;
}
const darkEarth=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({map:makeForestFloor(),color:0xffffff,roughness:1,metalness:0}));darkEarth.rotation.x=-Math.PI/2;darkEarth.position.y=-.045;scene.add(darkEarth);
// Dense procedural pixel forest — 420 irregular tree trunks, overhead branches,
// shrubs and groundcover. All are instanced for Quest mobile-GPU draw-call budgets.
const FOREST_COUNT=420;
const makePixelMaterial=(kind)=>{
 const c=document.createElement('canvas');c.width=64;c.height=128;
 const g=c.getContext('2d');
 const palettes=kind==='bark'?['#403029','#514034','#604d3b','#332a24','#71553b','#4d3e33','#67624b']:
 kind==='moss'?['#263623','#33422b','#47552c','#566239','#33412b','#696240']:
 ['#17251b','#203021','#283b29','#35482b','#2b3c24','#40502e'];
 for(let y=0;y<128;y+=8)for(let x=0;x<64;x+=8){
  const mossy=kind==='bark'&&y>70&&Math.random()<.4;
  const palette=mossy?['#47502d','#515d2d','#2f4128','#5a5c34']:palettes;
  g.fillStyle=pick(palette);g.fillRect(x,y,8,8);
  if(Math.random()<.22){g.fillStyle=pick(palette);g.fillRect(x+4,y,4,8);}
 }
 // Dark vertical bark splits.
 if(kind==='bark')for(let i=0;i<24;i++){g.fillStyle='#281f1b';g.fillRect(Math.floor(rnd(0,64)/4)*4,rnd(0,110),4,rnd(12,40));}
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.NearestFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
 return new THREE.MeshStandardMaterial({map,roughness:1,side:THREE.FrontSide});
};
const bark=makePixelMaterial('bark'),pine=makePixelMaterial('leaves'),mossMat=makePixelMaterial('moss');
const branchMat=new THREE.MeshStandardMaterial({color:0x453b2f,roughness:1});
const groundMat=new THREE.MeshStandardMaterial({color:0x292c1f,roughness:1});
const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.68,.84,1,7,1),bark,FOREST_COUNT);
const trunkProbe=new THREE.Mesh(trunk.geometry,bark);
trunkProbe.matrixAutoUpdate=false;
const trunkRay=new THREE.Raycaster(),trunkNormalMatrix=new THREE.Matrix3();
const hitFx=[],barkMarks=[];
const voxelGeo=new THREE.BoxGeometry(1,1,1),scarGeo=new THREE.PlaneGeometry(1,1);
const barkScarMat=new THREE.MeshBasicMaterial({color:0x17110d,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
const barkWoodMat=new THREE.MeshBasicMaterial({color:0x806543,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3});
const barkChipMats=[0x463429,0x6f4a2d,0x332b25,0x78583b,0x4f5038].map(color=>new THREE.MeshBasicMaterial({color}));
const bloodMats=[0x762018,0x981c18,0x47110f,0x9b2f25].map(color=>new THREE.MeshBasicMaterial({color}));
const canopy=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),pine,FOREST_COUNT);
const branch=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),branchMat,FOREST_COUNT);
const bush=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mossMat,FOREST_COUNT);
const grass=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mossMat,FOREST_COUNT*2);
const earthClumps=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),groundMat,FOREST_COUNT*2);
for(const mesh of [trunk,canopy,branch,bush,grass,earthClumps])mesh.frustumCulled=false;
const helper=new THREE.Object3D(),trees=[];
const colorVariation=new THREE.Color();
function treeAt(i,x,z){
 const height=rnd(8.5,18.5),radius=rnd(.26,.72),width=rnd(1.7,4.1),crownY=height+rnd(-.5,1.6),twist=rnd(-.22,.22);
 if(trees[i])for(let k=barkMarks.length-1;k>=0;k--){
  if(barkMarks[k].treeIndex===i){scene.remove(barkMarks[k].obj);barkMarks.splice(k,1);}
 }
 trees[i]={x,z,r:radius,h:height,index:i};
 helper.rotation.set(0,rnd(0,6.283),0);
 helper.position.set(x,height*.5,z);helper.scale.set(radius,height,radius);helper.rotation.z=twist;
 helper.updateMatrix();trunk.setMatrixAt(i,helper.matrix);
 // Tilted trunks have a visible base away from their instance origin.
 const basePoint=new THREE.Vector3(0,-.495,0).applyMatrix4(helper.matrix);
 trees[i].baseX=basePoint.x;trees[i].baseZ=basePoint.z;
 trees[i].hitMatrix=helper.matrix.clone();
 trees[i].reach=radius*.93+Math.abs(Math.sin(twist))*height*.51+.15;
 helper.rotation.set(0,rnd(0,6.283),0);
 // Broad, irregular elevated block foliage (visible above the low-light canopy).
 helper.position.set(x+rnd(-.6,.6),crownY,z+rnd(-.6,.6));
 helper.scale.set(width,rnd(2.1,4.4),rnd(1.8,4.1));helper.updateMatrix();canopy.setMatrixAt(i,helper.matrix);
 helper.rotation.set(rnd(-.2,.2),rnd(0,6.283),rnd(-.35,.35));
 helper.position.set(x+rnd(-1.1,1.1),height*rnd(.52,.80),z+rnd(-.6,.6));
 helper.scale.set(rnd(1.5,4.1),rnd(.23,.55),rnd(.21,.52));helper.updateMatrix();branch.setMatrixAt(i,helper.matrix);
 helper.rotation.set(0,rnd(0,6.28),0);
 const shrubHeight=rnd(.35,.95);
 helper.position.set(x+rnd(-2.1,2.1),shrubHeight*.5-.025,z+rnd(-2.1,2.1));
 helper.scale.set(rnd(.4,1.2),shrubHeight,rnd(.44,1.0));helper.updateMatrix();bush.setMatrixAt(i,helper.matrix);
 for(let k=0;k<2;k++){
  const slot=i*2+k;
  const bladeHeight=rnd(.32,.93);
  helper.position.set(x+rnd(-2.9,2.9),bladeHeight*.5-.012,z+rnd(-2.9,2.9));
  helper.scale.set(rnd(.07,.24),bladeHeight,rnd(.09,.25));
  helper.rotation.set(rnd(-.22,.22),rnd(0,6.283),rnd(-.2,.2));helper.updateMatrix();grass.setMatrixAt(slot,helper.matrix);
  helper.rotation.set(0,rnd(0,6.283),0);
  const patchHeight=rnd(.015,.08);
  helper.position.set(x+rnd(-2.9,2.9),patchHeight*.5-.04,z+rnd(-2.9,2.9));
  helper.scale.set(rnd(.24,.82),patchHeight,rnd(.34,1.1));helper.updateMatrix();earthClumps.setMatrixAt(slot,helper.matrix);
 }
 colorVariation.setHSL(rnd(.06,.12),rnd(.05,.18),rnd(.7,1));
 trunk.setColorAt(i,colorVariation);
 colorVariation.setHSL(rnd(.21,.33),rnd(.2,.4),rnd(.55,1));canopy.setColorAt(i,colorVariation);
}
function markForest(){for(const mesh of [trunk,canopy,branch,bush,grass,earthClumps]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}}
for(let i=0;i<FOREST_COUNT;i++){
 let a=rnd(0,Math.PI*2),d=Math.sqrt(rnd(0,1))*(58-3.6)+3.6;
 let x=Math.cos(a)*d,z=Math.sin(a)*d;
 for(let attempt=0;attempt<14;attempt++){
  let tooClose=false;
  for(let n=Math.max(0,i-32);n<i;n++){const t=trees[n];if(Math.hypot(x-t.x,z-t.z)<2.3){tooClose=true;break;}}
  if(!tooClose)break;
  a=rnd(0,Math.PI*2);d=rnd(3.8,58);x=Math.cos(a)*d;z=Math.sin(a)*d;
 }
 treeAt(i,x,z);
}
markForest();scene.add(trunk,canopy,branch,bush,grass,earthClumps);
let treeTick=0;
function maintainForest(){
 let dirty=false;
 for(let i=0;i<trees.length;i++){const t=trees[i],dx=t.x-rig.position.x,dz=t.z-rig.position.z;
  if(dx*dx+dz*dz>60*60){
   const a=rnd(0,Math.PI*2),d=rnd(40,58);
   treeAt(i,rig.position.x+Math.cos(a)*d,rig.position.z+Math.sin(a)*d);dirty=true;
  }
 }
 if(dirty)markForest();
}
function collideWithTrees(){
 // Slide away from thick trunks without trapping the player in the undergrowth.
 for(const t of trees){
  let dx=rig.position.x-t.baseX,dz=rig.position.z-t.baseZ;
  let minDist=t.r*.83+.32,d2=dx*dx+dz*dz;
  if(d2<minDist*minDist){const d=Math.max(.0001,Math.sqrt(d2));rig.position.x=t.baseX+dx/d*minDist;rig.position.z=t.baseZ+dz/d*minDist;}
 }
}

const steel=new THREE.MeshStandardMaterial({color:0x333d3c,metalness:.65,roughness:.38});
const rubber=new THREE.MeshStandardMaterial({color:0x151d1b,roughness:.84});
const attach=(root,geometry,material,x,y,z,rx=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.rotation.x=rx;root.add(m);return m;};
const lamp=new THREE.Group();camera.add(lamp);lamp.position.set(-.24,-.21,-.31);
attach(lamp,new THREE.CylinderGeometry(.035,.04,.21,9),steel,0,-.025,-.12,Math.PI/2);
attach(lamp,new THREE.CylinderGeometry(.055,.046,.07,12),rubber,0,-.025,-.255,Math.PI/2);
const lens=attach(lamp,new THREE.CylinderGeometry(.036,.036,.012,12),new THREE.MeshBasicMaterial({color:0xc3e5cc}),0,-.025,-.292,Math.PI/2);
// A broad, high-output focus spot plus a softer near-field spill.
const light=new THREE.SpotLight(0xfff5db,150,23,.36,.56,1.15);
light.position.set(0,-.025,-.3);light.target.position.set(0,-.025,-9);lamp.add(light,light.target);
const spill=new THREE.SpotLight(0xe0e5d5,34,11,1.02,.92,1.25);
spill.position.set(0,-.025,-.3);spill.target.position.set(0,-.025,-6);lamp.add(spill,spill.target);
const gun=new THREE.Group();camera.add(gun);gun.position.set(.27,-.275,-.46);
// Compact and recognizably different procedural pistol, shotgun, and SMG.
const gunDark=new THREE.MeshStandardMaterial({color:0x20292a,metalness:.65,roughness:.4});
const gunMetal=new THREE.MeshStandardMaterial({color:0x4d5551,metalness:.72,roughness:.32});
const gunGrip=new THREE.MeshStandardMaterial({color:0x272625,roughness:.9});
const gunWood=new THREE.MeshStandardMaterial({color:0x594132,roughness:.93});
const gunSight=new THREE.MeshBasicMaterial({color:0x8f9382});
const weaponShapes={};
const muzzleLocal=new THREE.Vector3(0,0,-.34);
function detailBox(group,w,h,d,x,y,z,material=gunMetal,rx=0){
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
 m.position.set(x,y,z);m.rotation.x=rx;group.add(m);return m;
}
function detailBarrel(group,r,length,x,y,front,material=gunDark){
 const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,10),material);
 m.rotation.x=Math.PI/2;m.position.set(x,y,front+length*.5);group.add(m);return m;
}
function makeGunModel(type){
 const g=new THREE.Group();gun.add(g);
 if(type==='pistol'){
  detailBox(g,.105,.085,.267,0,.017,-.133,gunMetal);
  detailBox(g,.099,.028,.20,0,-.041,-.143,gunDark);
  detailBox(g,.083,.154,.09,0,-.133,-.036,gunGrip,-.24);
  detailBox(g,.064,.028,.091,0,-.073,-.168,gunMetal);
  detailBarrel(g,.028,.082,0,.015,-.336);
  detailBox(g,.041,.022,.035,0,.073,-.062,gunSight);
  detailBox(g,.022,.019,.024,0,.073,-.265,gunSight);
  detailBox(g,.01,.055,.105,.054,-.11,-.156,gunDark);
  g.userData.muzzleZ=-.348;
 }else if(type==='shotgun'){
  detailBox(g,.13,.122,.285,0,.005,-.22,gunMetal);
  detailBarrel(g,.047,.57,0,.047,-.80);
  detailBarrel(g,.032,.44,0,-.023,-.76,gunDark);
  detailBox(g,.14,.10,.22,0,-.075,-.52,gunWood);
  detailBox(g,.11,.15,.24,0,-.03,.027,gunWood);
  detailBox(g,.07,.20,.10,0,-.155,-.21,gunGrip,-.3);
  detailBox(g,.07,.06,.24,0,-.04,.23,gunWood);
  detailBox(g,.016,.032,.022,0,.115,-.75,gunSight);
  g.userData.muzzleZ=-.81;
 }else{
  detailBox(g,.14,.15,.35,0,0,-.20,gunMetal);
  detailBox(g,.125,.074,.26,0,.099,-.19,gunDark);
  detailBox(g,.14,.1,.18,0,-.015,-.39,gunDark);
  detailBarrel(g,.039,.17,0,0,-.60);
  detailBox(g,.087,.27,.095,0,-.194,-.29,gunDark,.18);
  detailBox(g,.085,.17,.095,0,-.16,-.02,gunGrip,-.18);
  detailBox(g,.04,.04,.27,0,.01,.135,gunMetal);
  detailBox(g,.03,.11,.048,0,.015,.27,gunGrip);
  detailBox(g,.025,.035,.025,0,.16,-.33,gunSight);
  g.userData.muzzleZ=-.61;
 }
 g.scale.setScalar(type==='pistol'?.77:type==='shotgun'?.68:.75);
 g.visible=type==='pistol';weaponShapes[type]=g;
}
makeGunModel('pistol');makeGunModel('shotgun');makeGunModel('smg');
const muzzleRig=new THREE.Group();gun.add(muzzleRig);
const flash=new THREE.PointLight(0xffb769,0,12,1.45);
muzzleRig.add(flash);
// Direct a transient lighting cone FORWARD along the exact gun muzzle.
// A point light alone brightened the wrist and floor, not the target ahead.
const muzzleBeam=new THREE.SpotLight(0xffdeaa,0,18,.70,.72,1.15);
muzzleBeam.position.set(0,.006,-.012);
muzzleBeam.target.position.set(0,.006,-9);
muzzleRig.add(muzzleBeam,muzzleBeam.target);
const muzzleCanvas=document.createElement('canvas');muzzleCanvas.width=128;muzzleCanvas.height=128;
const muzzleCtx=muzzleCanvas.getContext('2d');
const flareGrad=muzzleCtx.createRadialGradient(64,64,0,64,64,64);
flareGrad.addColorStop(0,'rgba(255,255,230,1)');
flareGrad.addColorStop(.12,'rgba(255,227,133,.95)');
flareGrad.addColorStop(.35,'rgba(255,137,40,.67)');
flareGrad.addColorStop(.72,'rgba(255,74,15,.16)');
flareGrad.addColorStop(1,'rgba(255,80,0,0)');
muzzleCtx.fillStyle=flareGrad;muzzleCtx.fillRect(0,0,128,128);
const flareTex=new THREE.CanvasTexture(muzzleCanvas);
const flareSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:flareTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
flareSprite.scale.set(.34,.34,1);muzzleRig.add(flareSprite);
const flareCone=new THREE.Mesh(new THREE.ConeGeometry(.052,.20,5),new THREE.MeshBasicMaterial({color:0xffbe55,transparent:true,opacity:.74,depthWrite:false,blending:THREE.AdditiveBlending}));
flareCone.rotation.x=-Math.PI/2;flareCone.position.z=-.094;muzzleRig.add(flareCone);
muzzleRig.visible=false;
function updateMuzzleFlash(dt){
 muzzleTime=Math.max(0,muzzleTime-dt);
 const intensity=muzzleTime>0?muzzleTime/.13:0;
 flash.intensity=intensity*95;
 muzzleBeam.intensity=intensity*420;
 muzzleRig.visible=intensity>0;
 if(intensity>0){
  flareSprite.material.opacity=Math.min(1,.35+intensity*.64);
  flareSprite.scale.setScalar(.16+.21*intensity);
  flareCone.scale.setScalar(.7+.8*intensity);
 }
}
function setWeaponVisual(){
 for(const [type,mesh] of Object.entries(weaponShapes))mesh.visible=type===currentWeapon;
 const active=weaponShapes[currentWeapon]||weaponShapes.pistol;
 muzzleLocal.set(0,0,active.userData.muzzleZ*active.scale.z);
 muzzleRig.position.copy(muzzleLocal);
}

// Visible first-person body: torso, two legs and hands/forearms follow tracked
// Quest controllers (desktop uses virtual wrist positions by the held tools).
// No giant full-body mesh is placed in front of the camera.
const avatar=new THREE.Group();rig.add(avatar);
const coatMat=new THREE.MeshBasicMaterial({color:0x30433e});
const pantsMat=new THREE.MeshBasicMaterial({color:0x243532});
const glovesMat=new THREE.MeshBasicMaterial({color:0x47524e});
const bootsMat=new THREE.MeshBasicMaterial({color:0x202a28});
const torso=new THREE.Mesh(new THREE.BoxGeometry(.48,.63,.27),coatMat);
torso.position.set(0,1.08,.095);avatar.add(torso);
const belt=new THREE.Mesh(new THREE.BoxGeometry(.46,.07,.29),bootsMat);
belt.position.set(0,.75,.095);avatar.add(belt);
const walkingLegs=[];
for(const side of [-1,1]){
 const hip=new THREE.Group();hip.position.set(side*.135,.75,.07);avatar.add(hip);
 const leg=new THREE.Mesh(new THREE.BoxGeometry(.205,.68,.24),pantsMat);
 leg.position.y=-.345;hip.add(leg);
 const boot=new THREE.Mesh(new THREE.BoxGeometry(.235,.16,.33),bootsMat);
 boot.position.set(0,-.67,-.04);hip.add(boot);
 walkingLegs.push({hip,side});
}
const limbAxis=new THREE.Vector3(0,1,0);
const arms=[-1,1].map(side=>{
 const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.085,.096,1,7),coatMat);
 rig.add(sleeve);
 const cuff=new THREE.Mesh(new THREE.BoxGeometry(.145,.09,.17),bootsMat);
 rig.add(cuff);
 const glove=new THREE.Mesh(new THREE.BoxGeometry(.155,.14,.19),glovesMat);
 rig.add(glove);
 return {sleeve,cuff,glove,side};
});
const tempShoulder=new THREE.Vector3(),tempWrist=new THREE.Vector3(),tempSegment=new THREE.Vector3(),tempCenter=new THREE.Vector3();
function updateAvatar(){
 const playing=state==='playing';
 avatar.visible=playing;
 for(const arm of arms){arm.sleeve.visible=playing;arm.cuff.visible=playing;arm.glove.visible=playing;}
 if(!playing)return;
 const head=renderer.xr.isPresenting?renderer.xr.getCamera(camera):camera;
 const f=head.getWorldDirection(new THREE.Vector3());f.y=0;
 if(f.lengthSq()>.00001){f.normalize();avatar.rotation.y=-Math.atan2(f.x,-f.z);}
 avatar.updateWorldMatrix(true,true);
 const walking=elapsed<playerMovingUntil;
 for(const leg of walkingLegs)leg.hip.rotation.x=walking?Math.sin(elapsed*8+leg.side*Math.PI*.5)*.25:0;
 for(const arm of arms){
  const side=arm.side;
  tempShoulder.set(side*.315,1.30,.035);
  avatar.localToWorld(tempShoulder);
  const tracked=side<0?left:right;
  if(renderer.xr.isPresenting&&tracked){
   tracked.getWorldPosition(tempWrist);
   tempWrist.y-=.025;
  }else{
   tempWrist.set(side<0?-.245:.247,-.33,side<0?-.39:-.29);
   camera.localToWorld(tempWrist);
  }
  tempSegment.subVectors(tempWrist,tempShoulder);
  const length=Math.max(.06,tempSegment.length());
  tempCenter.copy(tempShoulder).addScaledVector(tempSegment,.5);
  rig.worldToLocal(tempCenter);
  arm.sleeve.position.copy(tempCenter);
  arm.sleeve.scale.set(1,length,1);
  arm.sleeve.quaternion.setFromUnitVectors(limbAxis,tempSegment.normalize());
  const localWrist=rig.worldToLocal(tempWrist.clone());
  arm.cuff.position.copy(localWrist).lerp(arm.sleeve.position,.15);
  arm.glove.position.copy(localWrist);
 }
}

const isTouchDevice=Number(navigator.maxTouchPoints||0)>0||window.matchMedia?.('(pointer: coarse)')?.matches===true;
let touchMoveX=0,touchMoveY=0,touchFiring=false;
const touchCss=document.createElement('style');touchCss.textContent="\n#touch-ui{display:none;position:fixed;inset:0;z-index:7;touch-action:none;pointer-events:none;font-family:monospace;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}\nbody.touch-play.playing:not(.xr-presenting) #touch-ui{display:block}\n#touch-look{position:absolute;inset:0 0 0 auto;width:68%;touch-action:none;pointer-events:auto}\n#touch-stick{position:absolute;left:calc(24px + env(safe-area-inset-left));bottom:calc(32px + env(safe-area-inset-bottom));width:148px;height:148px;border-radius:50%;border:2px solid #b8cba766;background:radial-gradient(circle,#899d5d25,#050b0875);pointer-events:auto;touch-action:none}\n#touch-knob{position:absolute;left:48px;top:48px;width:50px;height:50px;border-radius:50%;background:#b8d1a661;border:2px solid #c3e0aa94;box-shadow:0 0 20px #97ce7d22;pointer-events:none;transform:translate(0px,0px)}\n#touch-ui button{position:absolute;border:1px solid #bcd49b8a;color:#d8e9c0;background:#08130dc9;backdrop-filter:blur(7px);border-radius:14px;font:bold 13px monospace;letter-spacing:.5px;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none}\n#touch-ui button:active{background:#8fa47e77;color:#fff}\n#touch-fire{right:calc(24px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom));width:104px;height:104px;border-radius:50%!important;color:#f7e5da!important;border-color:#ca927fbb!important;font-size:17px!important;background:#25120cbf!important}\n#touch-reload{right:calc(146px + env(safe-area-inset-right));bottom:calc(37px + env(safe-area-inset-bottom));width:87px;height:54px}\n#touch-mode{right:calc(26px + env(safe-area-inset-right));bottom:calc(151px + env(safe-area-inset-bottom));width:100px;height:49px}\n#touch-charge{left:50%;transform:translateX(-50%);bottom:calc(33px + env(safe-area-inset-bottom));width:104px;height:57px}\n#touch-hint{position:absolute;left:50%;top:calc(12px + env(safe-area-inset-top));transform:translateX(-50%);background:#0209078a;border:1px solid #89988939;border-radius:18px;color:#9cae96;font:11px monospace;letter-spacing:.4px;padding:9px 13px;opacity:.79;pointer-events:none;white-space:nowrap}\n@media(max-width:700px){#touch-stick{left:12px;bottom:24px;width:116px;height:116px}#touch-knob{left:36px;top:36px;width:40px;height:40px}#touch-fire{right:12px;bottom:24px;width:85px;height:85px}#touch-reload{right:108px;bottom:28px;width:72px;height:44px;font-size:10px!important}#touch-mode{right:12px;bottom:118px;width:86px;height:44px}#touch-charge{bottom:25px;width:84px;height:50px;font-size:11px!important}#touch-hint{font-size:9px;padding:7px 8px}}\n@media(orientation:portrait){#touch-hint{top:67px}#touch-charge{bottom:calc(13px + env(safe-area-inset-bottom))}\n";document.head.appendChild(touchCss);

if(isTouchDevice){
 document.body.classList.add('touch-play');
 document.body.insertAdjacentHTML('beforeend',"<div id=\"touch-ui\" aria-label=\"Tablet controls\"><div id=\"touch-look\" aria-label=\"Drag to aim\"></div><div id=\"touch-stick\" aria-label=\"Virtual movement joystick\"><div id=\"touch-knob\"></div></div><button type=\"button\" id=\"touch-fire\">FIRE</button><button type=\"button\" id=\"touch-reload\">RELOAD</button><button type=\"button\" id=\"touch-mode\">WIDE</button><button type=\"button\" id=\"touch-charge\">LIGHT OFF</button><div id=\"touch-hint\">LEFT STICK · MOVE &nbsp; | &nbsp; RIGHT DRAG · LOOK</div></div>");
 const pad=$('touch-stick'),knob=$('touch-knob');let padId=null;
 function setPad(e){const b=pad.getBoundingClientRect(),x=e.clientX-(b.left+b.width/2),y=e.clientY-(b.top+b.height/2),r=Math.max(28,b.width*.35);touchMoveX=clamp(x/r,-1,1);touchMoveY=clamp(y/r,-1,1);const m=Math.hypot(touchMoveX,touchMoveY);if(m>1){touchMoveX/=m;touchMoveY/=m;}knob.style.transform='translate('+(touchMoveX*r*.68)+'px,'+(touchMoveY*r*.68)+'px)';}
 pad.addEventListener('pointerdown',e=>{e.preventDefault();if(padId!==null)return;padId=e.pointerId;pad.setPointerCapture(e.pointerId);setPad(e);});
 pad.addEventListener('pointermove',e=>{if(padId===e.pointerId){e.preventDefault();setPad(e);}});
 function padEnd(e){if(padId!==e.pointerId)return;padId=null;touchMoveX=0;touchMoveY=0;knob.style.transform='translate(0px,0px)';}
 pad.addEventListener('pointerup',padEnd);pad.addEventListener('pointercancel',padEnd);pad.addEventListener('lostpointercapture',padEnd);
 const look=$('touch-look');let lookId=null,lastLookX=0,lastLookY=0;
 look.addEventListener('pointerdown',e=>{if(lookId!==null)return;e.preventDefault();lookId=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;look.setPointerCapture(e.pointerId);});
 look.addEventListener('pointermove',e=>{if(lookId!==e.pointerId||state!=='playing')return;e.preventDefault();const dx=e.clientX-lastLookX,dy=e.clientY-lastLookY;lastLookX=e.clientX;lastLookY=e.clientY;yaw-=dx*.0044;pitch=clamp(pitch-dy*.0044,-1.25,1.25);camera.rotation.set(pitch,yaw,0);});
 const endLook=e=>{if(e.pointerId===lookId)lookId=null;};look.addEventListener('pointerup',endLook);look.addEventListener('pointercancel',endLook);look.addEventListener('lostpointercapture',endLook);
 const fireButton=$('touch-fire');let fireId=null;
 fireButton.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fireId=e.pointerId;fireButton.setPointerCapture(e.pointerId);touchFiring=true;fire();});
 const endFire=e=>{if(fireId===e.pointerId){fireId=null;touchFiring=false;}};fireButton.addEventListener('pointerup',endFire);fireButton.addEventListener('pointercancel',endFire);fireButton.addEventListener('lostpointercapture',endFire);
 $('touch-reload').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();reload();});
 $('touch-mode').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();toggleBeam();});
 const chargeButton=$('touch-charge');
 chargeButton.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();toggleFlashlight();});
 for(const el of document.querySelectorAll('#touch-ui button'))el.addEventListener('contextmenu',e=>e.preventDefault());
}


let left=null,right=null,shootHeld=false,rightReloadHeld=false,rightRetryHeld=false;
let beamMode='wide',leftXHeld=false,leftYHeld=false,leftTriggerHeld=false;
let flashlightOn=true,flashRunSeconds=30,lastToggleTime=-100;
function setFlashlightOn(on,announce=true){
 flashlightOn=Boolean(on)&&battery>0;
 const button=$('touch-charge');
 if(button){button.textContent=flashlightOn?'LIGHT OFF':'LIGHT ON';button.setAttribute('aria-label',flashlightOn?'Switch flashlight off':'Switch flashlight on');}
 if(announce&&state==='playing')notice(flashlightOn?'FLASHLIGHT ON':'FLASHLIGHT OFF · CHARGING');
}
function updateFlashlightBattery(seconds){
 if(state!=='playing'||seconds<=0)return;
 if(flashlightOn){
  battery=Math.max(0,battery-(batteryMax/flashRunSeconds)*seconds);
  if(battery<=0)setFlashlightOn(false,false);
 }else{
  // Always 5 seconds to recharge from 0% to 100%, even after upgrades.
  battery=Math.min(batteryMax,battery+(batteryMax/5)*seconds);
 }
}
function toggleFlashlight(){
 if(state!=='playing')return;
 // Quest selectstart and gamepad polling can report the same press.
 const now=performance.now();
 if(now-lastToggleTime<190)return;
 lastToggleTime=now;
 setFlashlightOn(!flashlightOn);
}

function setBeamMode(mode,announce=true){
 beamMode=mode==='focus'?'focus':'wide';
 light.angle=beamMode==='focus'?.34:.86;
 light.penumbra=beamMode==='focus'?.52:.78;
 spill.angle=beamMode==='focus'?.8:1.09;
 const btn=$('touch-mode');
 if(btn)btn.textContent=beamMode==='focus'?'FOCUS':'WIDE';
 if(announce&&state==='playing')notice(beamMode==='focus'?'FOCUSED BEAM · LONG RANGE':'WIDE BEAM · NEAR FIELD');
}
function toggleBeam(){setBeamMode(beamMode==='focus'?'wide':'focus');}

// A subdued physical wristwatch. No floating HUD in VR or on the monitor.
const watchCanvas=document.createElement('canvas');watchCanvas.width=512;watchCanvas.height=320;
const watchTexture=new THREE.CanvasTexture(watchCanvas);
const watch=new THREE.Group();camera.add(watch);watch.position.set(-.28,-.31,-.39);
const band=new THREE.Mesh(new THREE.CylinderGeometry(.058,.064,.115,12),new THREE.MeshStandardMaterial({color:0x252b28,roughness:.95}));
band.rotation.x=Math.PI/2;watch.add(band);
const watchBezel=new THREE.Mesh(new THREE.BoxGeometry(.178,.021,.119),new THREE.MeshStandardMaterial({color:0x171e1b,roughness:.43,metalness:.35}));
watchBezel.position.set(0,.071,0);watch.add(watchBezel);
const watchFace=new THREE.Mesh(new THREE.PlaneGeometry(.160,.103),new THREE.MeshBasicMaterial({map:watchTexture,color:0xc8d6c2,side:THREE.DoubleSide,depthWrite:false}));
watchFace.rotation.x=-Math.PI/2;watchFace.position.set(0,.084,0);watch.add(watchFace);
const watchGlow=new THREE.PointLight(0x9ab785,.13,.46,2);watchGlow.position.set(0,.085,0);watch.add(watchGlow);
function paintWatch(){
 const g=watchCanvas.getContext('2d');g.fillStyle='#060c09';g.fillRect(0,0,512,320);
 g.strokeStyle='#21372b';g.lineWidth=7;g.strokeRect(7,7,498,306);
 g.fillStyle='#65836d';g.font='25px monospace';g.fillText('ZOMBIEZ  /  WRIST-01',23,45);
 g.fillStyle=state==='dead'?'#bd6359':'#9fbca6';g.font='bold 76px monospace';g.fillText(state==='dead'?'0':'1',28,153);
 g.font='27px monospace';g.fillStyle='#5d8467';g.fillText('HEALTH',31,190);
 g.strokeStyle='#253c30';g.beginPath();g.moveTo(183,66);g.lineTo(183,280);g.stroke();
 g.fillStyle='#a1bfa5';g.font='bold 70px monospace';g.fillText(String(ammo).padStart(2,'0'),206,148);
 g.font='35px monospace';g.fillStyle='#6c8f73';g.fillText('/ '+String(specs[currentWeapon].mag+bonusMagazine).padStart(2,'0'),339,148);
 g.font='25px monospace';g.fillText('ROUNDS',213,189);
 g.fillStyle='#253e2d';g.fillRect(29,242,450,11);
 g.fillStyle=battery<15?'#b07a55':'#62856b';g.fillRect(29,242,450*clamp(battery/batteryMax,0,1),11);
 g.fillStyle=flashlightOn?'#b2d6a8':'#b3a97b';g.font='23px monospace';g.fillText((flashlightOn?'LIGHT ON ':'RECHARGING ')+Math.ceil(battery/batteryMax*100)+'%',30,290);
 watchTexture.needsUpdate=true;
}
const hands=[];
for(let i=0;i<2;i++){const c=renderer.xr.getController(i);rig.add(c);hands.push(c);
 c.addEventListener('connected',e=>{c.userData.input=e.data;if(e.data.handedness==='left'){left=c;c.add(lamp);lamp.position.set(0,-.032,-.07);c.add(watch);watch.position.set(-.012,-.082,.14);}if(e.data.handedness==='right'){right=c;c.add(gun);gun.position.set(0,-.04,-.08);}});
 c.addEventListener('disconnected',()=>{if(left===c){left=null;camera.add(lamp);lamp.position.set(-.24,-.21,-.31);camera.add(watch);watch.position.set(-.28,-.31,-.39);}if(right===c){right=null;camera.add(gun);gun.position.set(.27,-.275,-.46);}c.userData.input=null;});
  c.addEventListener('selectstart',()=>{
   if(c===left){toggleFlashlight();return;}
   if(c!==right)return;
   if(state==='dead'){startGame();return;}
   if(state==='playing'){shootHeld=true;fire();}
  });
 c.addEventListener('selectend',()=>{if(c===right)shootHeld=false;});
 c.addEventListener('squeezestart',()=>{if(c===right&&state==='playing')reload();});
}
const gfxCanvas=document.createElement('canvas');gfxCanvas.width=768;gfxCanvas.height=232;const gfx=new THREE.CanvasTexture(gfxCanvas);
const vrPanel=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.317),new THREE.MeshBasicMaterial({map:gfx,transparent:true,depthTest:false,depthWrite:false}));camera.add(vrPanel);vrPanel.position.set(0,-.37,-1.03);vrPanel.renderOrder=998;
const deathCanvas=document.createElement('canvas');deathCanvas.width=900;deathCanvas.height=560;const deathTex=new THREE.CanvasTexture(deathCanvas);
const deathPanel=new THREE.Mesh(new THREE.PlaneGeometry(1.52,.945),new THREE.MeshBasicMaterial({map:deathTex,transparent:true,depthTest:false,depthWrite:false}));camera.add(deathPanel);deathPanel.position.set(0,-.02,-1.5);deathPanel.renderOrder=999;deathPanel.visible=false;
const audioFiles=['pistol','shotgun','smg','reload-short','reload-smg-short','pump','fastzombie1','growl2','zombienoise3','z1','z5','z10','z14','z20'];
const sounds={};let ctx=null,wind=null,loadingAudio=false;
function audioInit(){try{if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();ctx.resume();if(!loadingAudio){loadingAudio=true;Promise.all(audioFiles.map(async name=>{try{const r=await fetch('./assets/audio/'+name+'.ogg');if(!r.ok)throw Error(name);sounds[name]=await ctx.decodeAudioData(await r.arrayBuffer());}catch(e){console.warn('Audio',name,e);}})).then(()=>startWind());}}catch(e){console.warn('Audio unavailable',e);}}
function startWind(){if(!ctx||wind)return;const n=ctx.sampleRate*2,b=ctx.createBuffer(1,n,ctx.sampleRate),s=b.getChannelData(0);for(let i=0;i<n;i++)s[i]=Math.random()*2-1;const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=b;src.loop=true;f.type='lowpass';f.frequency.value=160;g.gain.value=.026;src.connect(f).connect(g).connect(ctx.destination);src.start();wind=src;}
function sound(name,vol=.4,speed=1,loc=null){if(!ctx||!sounds[name])return;const node=ctx.createBufferSource(),gain=ctx.createGain();node.buffer=sounds[name];node.playbackRate.value=speed;gain.gain.value=vol;node.connect(gain);if(loc){const p=ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=2.5;p.maxDistance=42;p.rolloffFactor=1.3;p.positionX.value=loc.x;p.positionY.value=loc.y||1.2;p.positionZ.value=loc.z;gain.connect(p).connect(ctx.destination);}else gain.connect(ctx.destination);node.start();return node;}
function listenerUpdate(){if(!ctx)return;const view=renderer.xr.isPresenting?renderer.xr.getCamera(camera):camera,p=new THREE.Vector3(),q=new THREE.Quaternion();view.getWorldPosition(p);view.getWorldQuaternion(q);const f=new THREE.Vector3(0,0,-1).applyQuaternion(q),u=new THREE.Vector3(0,1,0).applyQuaternion(q),l=ctx.listener;if(l.positionX){l.positionX.value=p.x;l.positionY.value=p.y;l.positionZ.value=p.z;l.forwardX.value=f.x;l.forwardY.value=f.y;l.forwardZ.value=f.z;l.upX.value=u.x;l.upY.value=u.y;l.upZ.value=u.z;}else{l.setPosition(p.x,p.y,p.z);l.setOrientation(f.x,f.y,f.z,u.x,u.y,u.z);}}
const modelParts=15,modelLoader=new GLTFLoader();
modelLoader.setMeshoptDecoder(MeshoptDecoder);
let zombieTemplate=null,runClip=null,walkClip=null,idleClip=null,attackClip=null,modelError=null;
const modelReady=(async()=>{
 try{
  await MeshoptDecoder.ready;
  const chunks=await Promise.all(Array.from({length:modelParts},(_,i)=>fetch('./assets/npc-part-'+i+'.bin').then(r=>{
   if(!r.ok)throw Error('Missing character part '+i+' ('+r.status+')');return r.arrayBuffer();
  })));
  const total=chunks.reduce((n,x)=>n+x.byteLength,0);
  const bytes=new Uint8Array(total);let offset=0;
  for(const buffer of chunks){bytes.set(new Uint8Array(buffer),offset);offset+=buffer.byteLength;}
  const gltf=await new Promise((ok,fail)=>modelLoader.parse(bytes.buffer,'',ok,fail));
  zombieTemplate=gltf.scene;
  const importedSprint=gltf.animations.find(x=>x.name==='ZombieSprint');
  // Restrict transferred human running motion to legs only. The original zombie
  // controls the head, neck and spine; this prevents stretched or wandering heads.
  const safeTracks=importedSprint?.tracks.filter(t=>/(Left|Right)(UpperLeg|LowerLeg|Foot)/.test(t.name)&&!t.name.endsWith('.position'))||[];
  runClip=safeTracks.length?new THREE.AnimationClip('LegSprint',importedSprint.duration,safeTracks):null;
  walkClip=gltf.animations.find(x=>x.name==='ZombieWalk');
  idleClip=gltf.animations.find(x=>x.name==='ZombieIdle');
  attackClip=gltf.animations.find(x=>x.name==='ZombieAttack');
  if(!runClip||!walkClip||!attackClip)throw Error('Incomplete retargeted zombie clips: '+gltf.animations.map(x=>x.name).join(', '));
  zombieTemplate.traverse(o=>{if(!o.isMesh&&!o.isSkinnedMesh)return;
   o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;
   const mats=Array.isArray(o.material)?o.material:[o.material];
   for(const m of mats){
    if(m.map){m.map.magFilter=THREE.NearestFilter;m.map.minFilter=THREE.NearestMipmapNearestFilter;m.map.needsUpdate=true;}
    if(m.emissiveMap){m.emissiveMap.magFilter=THREE.NearestFilter;m.emissiveIntensity=0;}
   }
  });
  $('startlabel').textContent='ENTER THE FOREST';
  console.info('ZOMBIEZ: Zombie model loaded',total,'bytes',gltf.animations.map(x=>x.name));
  return true;
 }catch(e){
  modelError=e;console.error('Zombie model load failed',e);
  $('startlabel').textContent='MODEL LOAD FAILED';$('start').disabled=true;
  notice('COULD NOT LOAD ZOMBIE MODEL');return false;
 }
})();
const zombies=[],pickups=[],particles=[];
let state='menu',elapsed=0,wave=1,score=0,peak=0,ammo=6,battery=79,batteryMax=100,flashRange=22,flashDrain=7.1;
let currentWeapon='pistol',bonusMagazine=0,nextSpawn=0,nextDrop=0,frame=0,weaponCooldown=0,reloadCooldown=0,muzzleTime=0,noticeUntil=0;
let yaw=0,pitch=0,lastTime=performance.now(),uiClock=0;
const held=new Set(),ray=new THREE.Raycaster(),tempPos=new THREE.Vector3(),tempQuat=new THREE.Quaternion(),shotDirection=new THREE.Vector3();
const specs={pistol:{mag:6,rate:.3,spread:0,pellets:1,range:70,label:'SIDEARM / 9MM',sound:'pistol'},shotgun:{mag:4,rate:.78,spread:.11,pellets:7,range:25,label:'SHOTGUN / 12GA',sound:'shotgun'},smg:{mag:24,rate:.105,spread:.031,pellets:1,range:58,label:'SMG / AUTO',sound:'smg'}};
const matGlow=new THREE.MeshBasicMaterial({color:0xe2f17b});
function notice(t){$('toast').textContent=t;$('toast').classList.add('on');noticeUntil=performance.now()+1450;}
function updateNotice(){if(performance.now()>noticeUntil)$('toast').classList.remove('on');}
// Zombies inhabit the forest before the player makes noise. They wander, hear
// footsteps or gunfire, then pursue at varied speeds with staggered animation.
const noisePulses=[];
let playerMovingUntil=0;
let lastAlertAudio=0;
function signalNoise(radius,origin){
 noisePulses.push({x:origin.x,z:origin.z,radius,ttl:2.7});
 if(noisePulses.length>5)noisePulses.shift();
}
// Crowds grow steadily instead of accelerating the walkers. Quest starts
// with an optimistic 64-actor budget, then learns a safe ceiling from frame time.
// Desktop can reach 76, iPad defaults to 44.
let crowdBudget=64,perfSeconds=0,perfSamples=0,perfWindows=0;
function maxZombies(){
 const target=Math.min(64,18+Math.floor(elapsed/30)*3);
 const cap=renderer.xr.isPresenting?crowdBudget:isTouchDevice?Math.min(44,crowdBudget):Math.min(76,crowdBudget+12);
 return Math.min(target,cap);
}
function adaptCrowd(wallDt){
 if(state!=='playing')return;
 perfSeconds+=Math.min(.22,wallDt);perfSamples++;
 if(perfSeconds<5.0)return;
 const fps=perfSamples/perfSeconds;
 // Do not panic on short hitches (model downloads, loading audio).
 if(renderer.xr.isPresenting){
  if(fps<58){perfWindows=Math.min(5,perfWindows+1);if(perfWindows>=2)crowdBudget=Math.max(20,crowdBudget-5);}
  else if(fps>67){perfWindows=Math.max(-3,perfWindows-1);if(perfWindows<=-2)crowdBudget=Math.min(64,crowdBudget+4);}
  else perfWindows=0;
 }else if(isTouchDevice){
  if(fps<36){perfWindows=Math.min(5,perfWindows+1);if(perfWindows>=2)crowdBudget=Math.max(20,crowdBudget-4);}
  else if(fps>55){perfWindows=Math.max(-3,perfWindows-1);if(perfWindows<=-2)crowdBudget=Math.min(64,crowdBudget+3);}
  else perfWindows=0;
 }
 perfSeconds=0;perfSamples=0;
}
function chooseSpawn(radiusLo=31,radiusHi=55){
 const heading=camera.getWorldDirection(new THREE.Vector3()),cx=rig.position.x,cz=rig.position.z;
 for(let i=0;i<18;i++){
  const a=rnd(-Math.PI,Math.PI),d=rnd(radiusLo,radiusHi);
  const x=cx+Math.sin(a)*d,z=cz+Math.cos(a)*d;
  if(heading.x*(x-cx)+heading.z*(z-cz)>d*.75&&d<38)continue;
  // Spawn outside of tree trunk centers, not in occupied terrain.
  if(trees.some(t=>(t.baseX-x)*(t.baseX-x)+(t.baseZ-z)*(t.baseZ-z)<(t.r*.83+.6)**2))continue;
  if(zombies.some(o=>Math.hypot(o.obj.position.x-x,o.obj.position.z-z)<3))continue;
  return {x,z};
 }
 const a=rnd(-3.14159,3.14159),d=rnd(radiusLo,radiusHi);
 return {x:cx+Math.sin(a)*d,z:cz+Math.cos(a)*d};
}
function createZombie(angle=0,dist=30,initialAlert=false,forcedKind=null){
 if(!zombieTemplate||zombies.length>=maxZombies())return null;
 const obj=cloneSkeleton(zombieTemplate);
 const roll=Math.random(),kind=forcedKind||(roll<.55?'shambler':roll<.91?'stalker':'runner');
 const eliteChance=Math.min(.34,.022+Math.max(0,elapsed)/900*.32);
 const elite=Math.random()<eliteChance;
 const scale=rnd(.84,1.10);
 const speed=kind==='runner'?rnd(1.33,1.68):kind==='shambler'?rnd(.49,.79):rnd(.84,1.20);
 const skinTone=pick([0xbac5a9,0xb0bbb0,0x9bb8a7,0xc6b7ab,0x8da59b]);
 obj.scale.setScalar(scale);
 obj.position.set(rig.position.x+Math.sin(angle)*dist,0,rig.position.z+Math.cos(angle)*dist);
 const speedBoost=Math.min(.14,Math.floor(elapsed/120)*.023);
 const z={obj,speed:speed+speedBoost,scale,kind,alerted:initialAlert,
  mixer:new THREE.AnimationMixer(obj),voice:rnd(.45,2.4),hasScreamed:false,
  lurch:rnd(0,Math.PI*2),roamTimer:rnd(1.2,5),roamAngle:rnd(-3.14,3.14),
  attackTimer:rnd(1,2.5),walkAction:null,sprintAction:null,attackAction:null,
  fromY:0,hitScale:rnd(.94,1.05),hp:elite?7.5:3.6,elite,headHits:0,legHits:0,limp:1,flinch:0,animAccum:0,headBone:obj.getObjectByName('Head'),navTree:-1,navSide:1};
 obj.traverse(o=>{
  if(o.isSkinnedMesh||o.isMesh){
   o.userData.zombie=z;o.frustumCulled=false;
   if(o.material){const materials=Array.isArray(o.material)?o.material:[o.material];o.material=materials.map(m=>{
    const copy=m.clone();if(copy.color)copy.color.multiplyScalar(rnd(.89,1.08));
    if(copy.map){copy.map.magFilter=THREE.NearestFilter;copy.map.minFilter=THREE.NearestMipmapNearestFilter;}
    if(copy.emissiveMap)copy.emissiveIntensity=elite?1.15:0;
    return copy;
   });if(!Array.isArray(zombieTemplate?.material))o.material=o.material[0];}
  }
 });
 const walk=z.mixer.clipAction(walkClip),sprint=z.mixer.clipAction(runClip),attack=z.mixer.clipAction(attackClip);
 z.walkAction=walk;z.sprintAction=sprint;z.attackAction=attack;
 for(const action of [walk,sprint]){action.setLoop(THREE.LoopRepeat);action.time=rnd(0,Math.min(1,action.getClip().duration));action.play();}
 walk.setEffectiveWeight(1);
 sprint.setEffectiveWeight(initialAlert?(kind==='runner'?.38:.12):0);
 walk.timeScale=(kind==='runner'?rnd(1.05,1.32):kind==='shambler'?rnd(.46,.66):rnd(.73,.96));sprint.timeScale=kind==='runner'?rnd(.88,1.08):.76;
 attack.setEffectiveWeight(0);attack.play();
 obj.rotation.y=rnd(-Math.PI,Math.PI);scene.add(obj);zombies.push(z);
 return z;
}
function populateForest(){
 const origin=rnd(-Math.PI,Math.PI);
 // These three are already roaming near enough to notice a new survivor.
 for(let i=0;i<3;i++){
  const a=origin+i*Math.PI*2/3+rnd(-.3,.3);
  const z=createZombie(a,rnd(13,23),true,['shambler','shambler','stalker'][i]);
  if(z)z.speed=Math.min(z.speed,1.55);
 }
 for(let i=0;i<15;i++){
  const x=chooseSpawn(21,44),angle=Math.atan2(x.x-rig.position.x,x.z-rig.position.z);
  const z=createZombie(angle,Math.hypot(x.x-rig.position.x,x.z-rig.position.z),false);
  if(z)z.roamTimer=rnd(.2,4);
 }
}
function populateReplacement(){
 if(zombies.length>=maxZombies())return;
 let p=chooseSpawn(29,45);
 // Running forward should never outrun the world: place ambient roaming
 // undead along the player's future path, well outside the visible beam.
 if(elapsed<playerMovingUntil&&Math.random()<.66){
  const dir=(renderer.xr.isPresenting?renderer.xr.getCamera(camera):camera).getWorldDirection(new THREE.Vector3());
  dir.y=0;dir.normalize();
  const offset=rnd(-.55,.55),dist=rnd(30,44);
  const front=new THREE.Vector3(dir.x,0,dir.z).applyAxisAngle(new THREE.Vector3(0,1,0),offset);
  const candidate={x:rig.position.x+front.x*dist,z:rig.position.z+front.z*dist};
  const clear=trees.every(t=>Math.hypot(candidate.x-t.baseX,candidate.z-t.baseZ)>t.r*.83+.85);
  if(clear)p=candidate;
 }
 const a=Math.atan2(p.x-rig.position.x,p.z-rig.position.z);
 createZombie(a,Math.hypot(p.x-rig.position.x,p.z-rig.position.z),false);
}
// Stream distant, not-yet-visible inhabitants toward the player's path.
// Recycle slow stragglers left far behind if the world population cap is full.
let nextAheadCheck=0;
function keepForestPopulatedAhead(){
 if(state!=='playing'||elapsed>=playerMovingUntil)return;
 const facing=(renderer.xr.isPresenting?renderer.xr.getCamera(camera):camera).getWorldDirection(new THREE.Vector3());
 facing.y=0;if(facing.lengthSq()<.01)return;facing.normalize();
 const ahead=zombies.filter(z=>{
  const dx=z.obj.position.x-rig.position.x,dz=z.obj.position.z-rig.position.z,d=Math.hypot(dx,dz);
  return d>8&&d<44&&(dx*facing.x+dz*facing.z)>d*.24;
 });
 if(ahead.length>=4)return;
 const need=Math.min(3,4-ahead.length);
 const trailing=zombies.filter(z=>{
  const dx=z.obj.position.x-rig.position.x,dz=z.obj.position.z-rig.position.z,d=Math.hypot(dx,dz);
  return d>23&&(dx*facing.x+dz*facing.z)<-d*.34&&z.kind!=='runner';
 }).sort((a,b)=>(b.alerted?0:1)-(a.alerted?0:1));
 for(let i=0;i<need;i++){
  if(zombies.length>=maxZombies()){
   const straggler=trailing.pop();
   if(!straggler)break;
   zombies.splice(zombies.indexOf(straggler),1);
   straggler.mixer.stopAllAction();
   scene.remove(straggler.obj);
  }
  const angle=rnd(-.95,.95),dist=rnd(31,44);
  const candidate=facing.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle);
  const x=rig.position.x+candidate.x*dist,z=rig.position.z+candidate.z*dist;
  if(trees.some(t=>Math.hypot(x-t.baseX,z-t.baseZ)<t.r*.83+.9))continue;
  if(zombies.some(v=>Math.hypot(x-v.obj.position.x,z-v.obj.position.z)<3.4))continue;
  createZombie(Math.atan2(x-rig.position.x,z-rig.position.z),dist,false);
 }
}


function spawnFallingRagdoll(z){
 // Keep the skinned model in its original scene parent. Reparenting a rigged
 // GLB corrupts bone-space transforms and makes the corpse hover or teleport.
 z.mixer.timeScale=0;
 const corpse=z.obj,hips=corpse.getObjectByName('Hips');
 const hipPosition=hips?.position.clone(),hipRotation=hips?.quaternion.clone();
 const joints=[];
 for(const [name,x,zTilt] of [
  ['Head',-.26,.07],['Neck',-.12,.04],['Chest',.17,.11],
  ['LeftUpperArm',.82,-.3],['RightUpperArm',-.74,.26],
  ['LeftLowerArm',.57,.08],['RightLowerArm',-.42,-.13],
  ['LeftUpperLeg',-.43,.12],['RightUpperLeg',.53,-.13],
  ['LeftLowerLeg',.26,0],['RightLowerLeg',-.22,0]
 ]){
  const bone=corpse.getObjectByName(name);if(!bone)continue;
  joints.push({bone,from:bone.quaternion.clone(),offset:new THREE.Quaternion().setFromEuler(new THREE.Euler(x,0,zTilt))});
 }
 const p={obj:corpse,ragdoll:true,joints,hips,hipPosition,hipRotation,
  ttl:2.8,age:0,ang:0,angularVelocity:.5,dir:Math.random()<.5?-1:1};
 particles.push(p);
 const fallen=particles.filter(v=>v.ragdoll);
 if(fallen.length>7){
  const expired=fallen[0],idx=particles.indexOf(expired);
  if(idx>=0){scene.remove(expired.obj);particles.splice(idx,1);}
 }
}
function killZombie(z,headshot=false){
 if(!z||!zombies.includes(z))return;
 zombies.splice(zombies.indexOf(z),1);
 score++;
 if(headshot){headshots++;notice('HEADSHOT');}
 const pos=z.obj.position;
 sound(pick(['z1','z5','z14']),.36,rnd(.82,1.12),{x:pos.x,y:1.1,z:pos.z});
 spawnFallingRagdoll(z);
 if(score%10===0)notice(score+' ELIMINATED');
}
function zombieRoute(z,tx,tz,dt,multiplier=1){
 const pos=z.obj.position,dx=tx-pos.x,dz=tz-pos.z,d=Math.hypot(dx,dz);
 if(d<.09)return;
 const directX=dx/d,directZ=dz/d;
 let ux=directX,uz=directZ,obstacle=null,nearest=Infinity;
 const lookAhead=Math.min(d,3.5);
 for(const t of trees){
  const cx=t.baseX,cz=t.baseZ,ox=cx-pos.x,oz=cz-pos.z;
  const ahead=ox*directX+oz*directZ,rad=t.r*.83+.47;
  if(ahead<-.28||ahead>lookAhead+rad)continue;
  const perp=ox*directZ-oz*directX;
  if(Math.abs(perp)>rad+.19)continue;
  if(ahead<nearest){nearest=ahead;obstacle=t;}
 }
 if(obstacle){
  const cx=obstacle.baseX,cz=obstacle.baseZ;
  let rx=pos.x-cx,rz=pos.z-cz,rr=Math.max(.015,Math.hypot(rx,rz));rx/=rr;rz/=rr;
  if(z.navTree!==obstacle.index){
   z.navTree=obstacle.index;
   const cross=directX*(cz-pos.z)-directZ*(cx-pos.x);
   z.navSide=Math.abs(cross)>.13?(cross>=0?1:-1):(Math.random()<.5?1:-1);
  }
  const tangentX=z.navSide*(-rz),tangentZ=z.navSide*rx;
  ux=tangentX*.86+rx*.43+directX*.09;
  uz=tangentZ*.86+rz*.43+directZ*.09;
 }else z.navTree=-1;
 let sepX=0,sepZ=0;
 for(const other of zombies){
  if(other===z)continue;
  const qx=pos.x-other.obj.position.x,qz=pos.z-other.obj.position.z;
  const sq=qx*qx+qz*qz;
  if(sq>.0001&&sq<1.65*1.65){const weight=.25/(sq+.28);sepX+=qx*weight;sepZ+=qz*weight;}
 }
 ux+=clamp(sepX,-.5,.5);uz+=clamp(sepZ,-.5,.5);
 const mag=Math.hypot(ux,uz);ux/=Math.max(.001,mag);uz/=Math.max(.001,mag);
 const step=z.speed*multiplier*dt;
 let nextX=pos.x+ux*step,nextZ=pos.z+uz*step;
 for(const t of trees){
  const ox=nextX-t.baseX,oz=nextZ-t.baseZ;
  const rad=t.r*.83+.33,distSq=ox*ox+oz*oz;
  if(distSq<rad*rad){
   const norm=Math.max(.0001,Math.sqrt(distSq));
   nextX=t.baseX+ox/norm*rad;
   nextZ=t.baseZ+oz/norm*rad;
  }
 }
 pos.x=nextX;pos.z=nextZ;
 z.obj.rotation.y=Math.atan2(ux,uz);
}
// Visible pistol-mounted laser and shots share a single ballistic trace.
const laserGeom=new THREE.BufferGeometry();
laserGeom.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
const laserLine=new THREE.Line(laserGeom,new THREE.LineBasicMaterial({color:0xff2929,transparent:true,opacity:.88,depthTest:true,depthWrite:false,fog:false}));
gun.add(laserLine);
const laserDot=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color:0xff2020,depthTest:true,depthWrite:false,fog:false}));
scene.add(laserDot);
const laserGlow=new THREE.PointLight(0xff2420,.22,1.4,2);
laserDot.add(laserGlow);
const aimOrigin=new THREE.Vector3(),aimDir=new THREE.Vector3(),aimQuat=new THREE.Quaternion();
function getAim(){
 gun.updateWorldMatrix(true,false);
 gun.localToWorld(aimOrigin.copy(muzzleLocal));
 gun.getWorldQuaternion(aimQuat);
 aimDir.set(0,0,-1).applyQuaternion(aimQuat).normalize();
 if(!renderer.xr.isPresenting){
  // Desktop and touch: the visible center reticle is the ballistic ray.
  // An offset muzzle previously grazed past the precise surface it indicated.
  camera.getWorldPosition(aimOrigin);
  camera.getWorldDirection(aimDir).normalize();
 }
 return {origin:aimOrigin,direction:aimDir};
}
function sphereIntercept(origin,dir,x,y,z,radius){
 const dx=origin.x-x,dy=origin.y-y,dz=origin.z-z;
 const b=dx*dir.x+dy*dir.y+dz*dir.z;
 const disc=b*b-(dx*dx+dy*dy+dz*dz-radius*radius);
 if(disc<0)return Infinity;
 const root=Math.sqrt(disc),near=-b-root,far=-b+root;
 return near>0.015?near:far>0.015?far:Infinity;
}
function traceBallistic(origin,dir,range=66){
 let best=range,hitZombie=null,hitTree=null,zone=null;
 // The actual animated Head bone, not an assumed stationary height, defines
 // the cranial hit box. A little VR forgiveness helps at distance.
 const headPosition=new THREE.Vector3(),headOffset=new THREE.Vector3(0,.105,0);
 for(const z of zombies){
  const p=z.obj.position,sc=z.scale*z.hitScale;
  if(z.headBone){
   z.headBone.updateWorldMatrix(true,false);
   headPosition.copy(headOffset).applyMatrix4(z.headBone.matrixWorld);
  }else headPosition.set(p.x,p.y+1.43*sc,p.z);
  const distance=origin.distanceTo(headPosition);
  const rHead=sc*Math.min(.42,.30+Math.max(0,distance-12)*.0035);
  const headHit=sphereIntercept(origin,dir,headPosition.x,headPosition.y,headPosition.z,rHead);
  if(headHit<best){
   best=headHit;hitZombie=z;hitTree=null;zone='head';
  }
  const parts=[
   ['torso',0,1.06,0,.33],
   ['torso',0,.80,0,.31],
   ['leg',-.15,.42,0,.22],
   ['leg',.15,.42,0,.22],
   ['limb',-.40,1.12,0,.23],
   ['limb',.40,1.12,0,.23]
  ];
  for(const [part,x,y,zz,r] of parts){
   const t=sphereIntercept(origin,dir,p.x+x*sc,p.y+y*sc,p.z+zz*sc,r*sc);
   if(t>=best)continue;
   // Do not steal a face shot with the upper torso, especially when the
   // animated head bends forward and overlaps the shoulder hit volume.
   if(zone==='head'&&hitZombie===z&&t>best-.25)continue;
   best=t;hitZombie=z;hitTree=null;zone=part;
  }
 }
 // Exact 7-sided tapered, tilted mesh collision. Cheap candidate shortlist
 // prevents testing the triangles of all 420 trees on every laser frame.
 let hitNormal=null;
 const dxz=dir.x*dir.x+dir.z*dir.z;
 if(dxz>.00001){
  trunkRay.set(origin,dir);trunkRay.near=.018;
  for(const tree of trees){
   const ox=origin.x-tree.x,oz=origin.z-tree.z,reach=tree.reach||tree.r+1;
   const nearT=clamp(-(ox*dir.x+oz*dir.z)/dxz,0,best);
   const x=ox+dir.x*nearT,z=oz+dir.z*nearT;
   if(x*x+z*z>reach*reach)continue;
   trunkProbe.matrixWorld.copy(tree.hitMatrix);
   trunkRay.far=best;
   const results=[];
   trunkProbe.raycast(trunkRay,results);
   for(const h of results){
    if(h.distance<.018||h.distance>=best)continue;
    best=h.distance;hitZombie=null;hitTree=tree;zone=null;
    trunkNormalMatrix.getNormalMatrix(tree.hitMatrix);
    hitNormal=h.face.normal.clone().applyNormalMatrix(trunkNormalMatrix).normalize();
   }
  }
 }
 return {distance:best,zombie:hitZombie,tree:hitTree,zone,normal:hitNormal,point:origin.clone().addScaledVector(dir,best)};
}
function updateLaser(){
 if(state!=='playing'){laserLine.visible=false;laserDot.visible=false;return;}
 laserLine.visible=true;laserDot.visible=true;
 const {origin,direction}=getAim();
 const h=traceBallistic(origin,direction,Math.max(44,specs[currentWeapon].range));
 laserDot.position.copy(h.point);
 const dist=h.distance;
 laserDot.scale.setScalar(clamp(dist*.08,1.6,6.5));
 laserGlow.intensity=h.zombie?.55:.19;laserDot.material.color.setHex(h.tree?0xffa64c:h.zone==='head'?0xffdd55:0xff2020);
 const localHit=gun.worldToLocal(h.point.clone());
 const arr=laserGeom.attributes.position;
 arr.setXYZ(0,0,-.012,-.408);arr.setXYZ(1,localHit.x,localHit.y,localHit.z);
 arr.needsUpdate=true;
}
// Headshots are immediately fatal. Other hits accumulate damage; enough leg
// hits slow a walker, while body hits require multiple rounds.
let headshots=0;
function applyZombieHit(z,zone,damage){
 if(!z||!zombies.includes(z))return;
 if(zone==='head'){
  if(!z.elite||currentWeapon==='shotgun'||++z.headHits>=2||z.hp<=2.3){
   killZombie(z,true);return;
  }
  z.hp=Math.max(.1,z.hp-2.3);z.flinch=.32;
  notice('HARDENED · HEADSHOT '+z.headHits+'/2');
  return;
 }
 const multiplier=zone==='limb'?.72:zone==='leg'?.84:1;
 const dealt=damage*multiplier;
 z.hp-=dealt;
 z.flinch=.11+Math.min(.22,damage*.04);
 if(zone==='leg'){
  z.legHits++;
  if(z.legHits>=2)z.limp=Math.max(.40,z.limp*.72);
 }
 // Separate hit feedback from death so a body shot is not silently fatal.
 if(z.hp<=0)killZombie(z,false);
}
// Readable, understated impacts: dark blood flecks on zombies and small
// bark voxels with a shallow lasting gouge exactly where the tree was struck.
const impactNormalAxis=new THREE.Vector3(0,0,1);
function impactFragments(point,normal,materials,count=5){
 const n=normal?.clone().normalize()||new THREE.Vector3(0,0,1);
 for(let i=0;i<count;i++){
  const mesh=new THREE.Mesh(voxelGeo,pick(materials));
  const size=rnd(.018,.056);
  mesh.scale.set(size,rnd(.018,.065),size);
  mesh.position.copy(point).addScaledVector(n,rnd(.025,.07));
  mesh.rotation.set(rnd(-1,1),rnd(-1,1),rnd(-1,1));
  const vx=n.x*rnd(.38,1.2)+rnd(-.75,.75),vz=n.z*rnd(.38,1.2)+rnd(-.75,.75);
  scene.add(mesh);
  hitFx.push({mesh,vel:new THREE.Vector3(vx,rnd(.25,1.45),vz),ttl:rnd(.34,.76),spin:rnd(-5,5)});
 }
 while(hitFx.length>100){scene.remove(hitFx[0].mesh);hitFx.shift();}
}
function impactBark(hit){
 const tree=hit.tree;
 if(!tree)return;
 const n=hit.normal||new THREE.Vector3(0,0,1);
 impactFragments(hit.point,n,barkChipMats,6);
 const scar=new THREE.Group();
 const outside=new THREE.Mesh(scarGeo,barkScarMat);
 outside.scale.set(rnd(.10,.19),rnd(.12,.26),1);
 scar.add(outside);
 const exposed=new THREE.Mesh(scarGeo,barkWoodMat);
 exposed.scale.set(outside.scale.x*.37,outside.scale.y*.7,1);
 exposed.rotation.z=rnd(-.55,.55);exposed.position.z=.004;scar.add(exposed);
 scar.position.copy(hit.point).addScaledVector(n,.015);
 scar.quaternion.setFromUnitVectors(impactNormalAxis,n);
 scene.add(scar);
 barkMarks.push({obj:scar,treeIndex:tree.index,ttl:55});
 while(barkMarks.length>85){scene.remove(barkMarks[0].obj);barkMarks.shift();}
}
function updateImpactEffects(dt){
 for(let i=hitFx.length-1;i>=0;i--){
  const fx=hitFx[i];fx.ttl-=dt;
  fx.vel.y-=4.6*dt;
  fx.mesh.position.addScaledVector(fx.vel,dt);
  fx.mesh.rotation.y+=fx.spin*dt;
  if(fx.mesh.position.y<.025)fx.ttl=0;
  if(fx.ttl<=0){scene.remove(fx.mesh);hitFx.splice(i,1);}
 }
 for(let i=barkMarks.length-1;i>=0;i--){
  const mark=barkMarks[i];mark.ttl-=dt;
  if(mark.ttl<=0){scene.remove(mark.obj);barkMarks.splice(i,1);}
 }
}
function shotTrace(origin,direction,spread=0){
 const dir=direction.clone();
 if(spread){dir.x+=rnd(-spread,spread);dir.y+=rnd(-spread,spread);dir.z+=rnd(-spread,spread);dir.normalize();}
 return traceBallistic(origin,dir,specs[currentWeapon].range);
}
function fire(){
 if(state!=='playing'||weaponCooldown>0||reloadCooldown>0)return;
 const cfg=specs[currentWeapon];
 if(ammo<=0){notice('EMPTY — RELOAD');sound('reload-short',.12,1.2);weaponCooldown=.32;return;}
 ammo--;weaponCooldown=cfg.rate;muzzleTime=.13;
 const {origin,direction}=getAim(),start=origin.clone(),dir=direction.clone();
 signalNoise(currentWeapon==='shotgun'?59:currentWeapon==='smg'?51:48,start);
 sound(cfg.sound,currentWeapon==='shotgun'?.78:.55,rnd(.9,1.1));
 if(currentWeapon==='shotgun')sound('pump',.16,.94);
 // Group a shotgun's pellets so one body hit cannot accidentally consume its
 // whole 3.6 HP budget. A pellet to the head still ends it immediately.
 const hits=new Map(),barkHits=new Map();
 for(let i=0;i<cfg.pellets;i++){
  const hit=shotTrace(start,dir,cfg.spread);
  if(hit.tree){if(!barkHits.has(hit.tree.index))barkHits.set(hit.tree.index,hit);continue;}
  if(!hit.zombie)continue;
  let entry=hits.get(hit.zombie);
  if(!entry){entry={count:0,head:false,zone:hit.zone,point:hit.point.clone()};hits.set(hit.zombie,entry);}
  entry.count++;
  if(hit.zone==='head')entry.head=true;
  else if(hit.zone==='leg')entry.zone='leg';
 }
 for(const impact of barkHits.values())impactBark(impact);
 for(const [z,entry] of hits){
  impactFragments(entry.point,dir.clone().negate(),bloodMats,entry.head?6:4);
  if(entry.head){applyZombieHit(z,'head',Infinity);continue;}
  const base=currentWeapon==='pistol'?1.3:currentWeapon==='smg'?.78:Math.min(2.25,.55*entry.count);
  applyZombieHit(z,entry.zone,base);
 }
 right?.userData.input?.gamepad?.hapticActuators?.[0]?.pulse?.(.36,35)?.catch?.(()=>{});
 updateUI();
}

function reload(){if(state!=='playing'||reloadCooldown>0)return;const max=specs[currentWeapon].mag+bonusMagazine;if(ammo>=max)return;reloadCooldown=currentWeapon==='smg'?.85:.64;
 sound(currentWeapon==='smg'?'reload-smg-short':'reload-short',.48,1);notice('RELOADING...');}
function pickupLabel(text){const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.fillStyle='#10170fe6';g.fillRect(0,14,512,104);g.strokeStyle='#e2f17b';g.strokeRect(3,17,506,98);g.font='bold 38px monospace';g.textAlign='center';g.fillStyle='#e2f17b';g.fillText(text,256,81);const tex=new THREE.CanvasTexture(c),mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.45,.36),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));mesh.position.y=1.63;return mesh;}
// Ground-level supply crates replace oversized floating labels/icons.
// Compact, unmistakable upgrade icons rather than identical treasure chests.
function pickupTexture(kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
 const g=canvas.getContext('2d');
 const palette={flash:'#abd69d',shotgun:'#dca574',smg:'#95bbd8',ammo:'#d4bb73'};
 const color=palette[kind]||'#abb8a2';
 g.fillStyle='#0d1510c8';g.fillRect(7,5,114,117);
 g.strokeStyle=color;g.lineWidth=5;g.strokeRect(10,8,108,110);
 g.fillStyle='#ffffff12';g.fillRect(13,11,102,73);
 g.fillStyle=color;
 if(kind==='flash'){
  // Flashlight with clear beam / charge symbol.
  g.save();g.translate(58,56);g.rotate(-.35);
  g.fillRect(-16,-21,28,48);
  g.fillStyle='#26392c';g.fillRect(-12,-15,20,32);
  g.fillStyle=color;g.fillRect(-20,-27,36,11);g.fillRect(-15,25,27,9);
  g.restore();
  g.strokeStyle=color;g.lineWidth=4;g.beginPath();g.moveTo(71,28);g.lineTo(92,16);g.moveTo(76,49);g.lineTo(102,43);g.stroke();
 }else if(kind==='shotgun'){
  // Long barrel and wooden pump, viewed in profile.
  g.fillRect(19,36,87,10);g.fillRect(48,45,30,17);
  g.fillRect(76,29,25,6);
  g.fillStyle='#634532';g.fillRect(18,41,27,29);
  g.fillStyle=color;g.fillRect(49,58,13,20);g.fillRect(78,46,18,9);
 }else if(kind==='smg'){
  // Box receiver, short barrel, stick magazine, and rear stock.
  g.fillRect(24,34,69,19);g.fillRect(89,37,19,9);
  g.fillRect(11,42,16,9);g.fillRect(23,48,15,6);
  g.fillRect(47,52,14,31);g.fillRect(75,53,10,15);
  g.fillRect(55,24,29,7);
 }else{
  // Ammo magazine and three round silhouettes.
  g.fillRect(35,44,51,37);g.fillStyle='#263324';g.fillRect(39,48,43,28);
  g.fillStyle=color;
  for(const x of [39,54,69]){
   g.fillRect(x,30,11,25);g.beginPath();g.moveTo(x,30);g.lineTo(x+5.5,20);g.lineTo(x+11,30);g.fill();
  }
  g.fillRect(40,79,41,6);
 }
 const title={flash:'LIGHT +10s',shotgun:'SHOTGUN',smg:'SMG',ammo:'AMMO +'}[kind];
 g.font='bold 15px monospace';g.fillStyle=color;g.textAlign='center';g.fillText(title,64,108);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearFilter;
 return texture;
}
const pickupTextures=Object.fromEntries(['flash','shotgun','smg','ammo'].map(kind=>[kind,pickupTexture(kind)]));
function makePickup(kind){
 if(pickups.length>=3)return;
 const a=rnd(-Math.PI,Math.PI),d=rnd(6.5,10.5),g=new THREE.Group();
 g.position.set(rig.position.x+Math.sin(a)*d,0,rig.position.z+Math.cos(a)*d);
 const colors={flash:0xa4cb87,shotgun:0xcc9a70,smg:0x84b5cd,ammo:0xd4bb73};
 const color=colors[kind]||0xc0ccaf;
 const icon=new THREE.Sprite(new THREE.SpriteMaterial({map:pickupTextures[kind],transparent:true,depthWrite:false,opacity:.89}));
 icon.position.y=.52;icon.scale.set(.63,.63,1);g.add(icon);
 const baseMat=new THREE.MeshStandardMaterial({color:0x242c24,roughness:1});
 const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.23,.28,.11,6),baseMat);
 plinth.position.y=.063;g.add(plinth);
 const ringMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide});
 const ring=new THREE.Mesh(new THREE.RingGeometry(.24,.41,24),ringMat);
 ring.rotation.x=-Math.PI/2;ring.position.y=.016;g.add(ring);
 const glow=new THREE.PointLight(color,.24,2.3,2);glow.position.y=.44;g.add(glow);
 scene.add(g);pickups.push({g,kind,age:0,icon,glow});
}

function grab(p){scene.remove(p.g);pickups.splice(pickups.indexOf(p),1);if(p.kind==='flash'){flashRunSeconds=Math.min(90,flashRunSeconds+10);flashRange=Math.min(30,flashRange+3);flashDrain=batteryMax/flashRunSeconds;battery=clamp(battery+35,0,batteryMax);notice('FLASHLIGHT '+flashRunSeconds+'S RUNTIME');}else if(p.kind==='ammo'){const gain=currentWeapon==='smg'?6:2;bonusMagazine=Math.min(24,bonusMagazine+gain);ammo=Math.min(specs[currentWeapon].mag+bonusMagazine,ammo+gain);notice('EXTENDED MAGAZINE +'+gain);}else{currentWeapon=p.kind;setWeaponVisual();bonusMagazine=0;ammo=specs[currentWeapon].mag;notice(currentWeapon==='shotgun'?'SHOTGUN ACQUIRED':'SMG ACQUIRED');}sound('reload-short',.58,1.25);updateUI();}
function clearWorld(){for(const z of zombies){scene.remove(z.obj);z.mixer.stopAllAction();}zombies.length=0;for(const p of pickups)scene.remove(p.g);pickups.length=0;for(const p of particles)scene.remove(p.obj);particles.length=0;for(const fx of hitFx)scene.remove(fx.mesh);hitFx.length=0;for(const mark of barkMarks)scene.remove(mark.obj);barkMarks.length=0;}
function startGame(){if(state==='dead'&&!deathReady)return;if(!zombieTemplate){notice('LOADING 3D MODEL...');return;}clearDeathReplay();deathReady=false;gun.visible=true;lamp.visible=true;crowdBudget=64;perfSeconds=0;perfSamples=0;perfWindows=0;clearWorld();state='playing';elapsed=0;wave=2;score=0;headshots=0;ammo=6;currentWeapon='pistol';setWeaponVisual();bonusMagazine=0;battery=100;batteryMax=100;flashRange=22;flashRunSeconds=30;flashDrain=100/30;setFlashlightOn(true,false);lastToggleTime=-100;setBeamMode('wide',false);nextSpawn=1.9;nextDrop=24;noisePulses.length=0;playerMovingUntil=0;nextAheadCheck=0;frame=0;weaponCooldown=0;reloadCooldown=0;rig.position.set(0,0,0);leftTriggerHeld=false;
 const v=renderer.xr.isPresenting;vrPanel.visible=false;deathPanel.visible=false;leftXHeld=false;leftYHeld=false;touchMoveX=0;touchMoveY=0;document.body.classList.add('playing');$('menu').classList.add('off');for(const id of ['hud','battery','elims'])$(id).classList.remove('hidden');$('reticle').classList.toggle('hidden',v);
 populateForest();updateAvatar();audioInit();if(!v&&!isTouchDevice)renderer.domElement.requestPointerLock?.().catch(()=>{});updateUI();}
// A short third-person reconstruction explains the fatal hit without forcibly
// moving the VR headset camera (which could make the user uncomfortable).
let deathReplay=null,deathReady=false,deathDirection='BEHIND YOU';
function makeReplayVictim(){
 const person=new THREE.Group();
 const coat=new THREE.MeshBasicMaterial({color:0x719c90});
 const skin=new THREE.MeshBasicMaterial({color:0xd7a182});
 const boots=new THREE.MeshBasicMaterial({color:0x343c41});
 const body=new THREE.Mesh(new THREE.BoxGeometry(.48,.68,.29),coat);body.position.y=1.15;person.add(body);
 const head=new THREE.Mesh(new THREE.BoxGeometry(.3,.32,.31),skin);head.position.y=1.67;person.add(head);
 const leftArm=new THREE.Mesh(new THREE.BoxGeometry(.2,.64,.22),coat);leftArm.position.set(-.35,1.1,0);person.add(leftArm);
 const rightArm=leftArm.clone();rightArm.position.x=.35;person.add(rightArm);
 for(const x of [-.14,.14]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.22,.75,.23),boots);leg.position.set(x,.4,0);person.add(leg);}
 const skull=new THREE.Mesh(new THREE.BoxGeometry(.27,.12,.04),boots);skull.position.set(0,1.81,-.14);person.add(skull);
 return {person,body,head,leftArm,rightArm};
}
function clearDeathReplay(){
 if(!deathReplay)return;
 if(deathReplay.mixer)deathReplay.mixer.stopAllAction();
 camera.remove(deathReplay.scene);
 deathReplay=null;
}
function showDeathReplay(attacker){
 clearDeathReplay();
 const enemyPosition=attacker?.obj?.getWorldPosition(new THREE.Vector3())||rig.position.clone().add(new THREE.Vector3(0,0,1.1));
 const headView=renderer.xr.isPresenting?renderer.xr.getCamera(camera):camera;
 const heading=headView.getWorldQuaternion(new THREE.Quaternion());
 const from=enemyPosition.clone().sub(rig.position);from.y=0;
 const local=from.clone().applyQuaternion(heading.invert());
 deathDirection=Math.abs(local.z)>=Math.abs(local.x)?
  (local.z>0?'BEHIND YOU':'IN FRONT OF YOU'):
  (local.x>0?'ON YOUR RIGHT':'ON YOUR LEFT');
 const d=new THREE.Vector3(local.x,0,local.z).normalize();
 if(d.lengthSq()<.01)d.set(0,0,1);
 const stage=new THREE.Group();stage.position.set(0,-.25,-1.9);stage.scale.setScalar(.54);
 camera.add(stage);
 const banner=document.createElement('canvas');banner.width=768;banner.height=92;
 const bg=banner.getContext('2d');bg.fillStyle='#13130fe6';bg.fillRect(0,0,768,92);
 bg.strokeStyle='#b75a45';bg.lineWidth=4;bg.strokeRect(3,3,762,86);
 bg.textAlign='center';bg.font='bold 42px monospace';bg.fillStyle='#ffaa96';
 bg.fillText('FATAL HIT: '+deathDirection,384,61);
 const bannerTexture=new THREE.CanvasTexture(banner);
 const bannerMesh=new THREE.Mesh(new THREE.PlaneGeometry(3.55,.44),new THREE.MeshBasicMaterial({map:bannerTexture,transparent:true,depthTest:false,depthWrite:false}));
 bannerMesh.position.set(0,2.61,.3);bannerMesh.renderOrder=998;stage.add(bannerMesh);
 const backplate=new THREE.Mesh(new THREE.BoxGeometry(4.85,3.35,.1),new THREE.MeshBasicMaterial({color:0x0b1612,depthTest:true,depthWrite:true}));
 backplate.position.set(0,1.1,-2.5);stage.add(backplate);
 const ground=new THREE.Mesh(new THREE.CylinderGeometry(2.35,2.35,.1,24),new THREE.MeshBasicMaterial({color:0x27372b}));
 ground.position.y=-.055;stage.add(ground);
 const lightScene=new THREE.PointLight(0xeaffdc,27,7);lightScene.position.set(-1.2,3.7,2.9);stage.add(lightScene);
 const fill=new THREE.HemisphereLight(0xc5e1ce,0x1b271b,2.1);stage.add(fill);
 const redBack=new THREE.PointLight(0xaa413b,3,5);redBack.position.set(d.x*2.2,1,d.z*2.2);stage.add(redBack);
 const victim=makeReplayVictim();stage.add(victim.person);
 const enemy=cloneSkeleton(zombieTemplate);
 enemy.position.copy(d).multiplyScalar(1.85);enemy.scale.setScalar(.94);
 enemy.rotation.y=Math.atan2(-d.x,-d.z);
 stage.add(enemy);
 const mixer=new THREE.AnimationMixer(enemy);
 const action=mixer.clipAction(walkClip);action.play();action.timeScale=1.0;
 deathReplay={scene:stage,enemy,mixer,victim,elapsed:0,initial:d.clone().multiplyScalar(1.85),to:d.clone().multiplyScalar(.58)};
 deathReady=false;
}
function updateDeathReplay(dt){
 if(!deathReplay||deathReady)return;
 const p=deathReplay;p.elapsed+=dt;
 const approach=clamp(p.elapsed/.85,0,1);
 p.enemy.position.lerpVectors(p.initial,p.to,approach);
 p.mixer.update(dt*(p.elapsed<1.1?1:0));
 const fall=clamp((p.elapsed-1.0)/1.1,0,1);
 // The small player proxy is viewed from outside, rather than zooming the VR camera.
 p.victim.person.rotation.x=fall*-1.25;
 p.victim.person.position.y=-.15*fall;
 p.victim.leftArm.rotation.z=-fall*.45;
 p.victim.rightArm.rotation.z=fall*.4;
 if(p.elapsed>=3){
  deathReady=true;
  clearDeathReplay();
  gun.visible=true;lamp.visible=true;
  if(renderer.xr.isPresenting){deathPanel.visible=true;paintDeath();paintWatch();}
  else{
   $('menu').classList.remove('off');
   $('startlabel').textContent='SURVIVE AGAIN';
   document.querySelector('.overline').textContent='╾  YOU DID NOT SURVIVE';
   document.querySelector('main p').innerHTML='ATTACKED <b style="color:#f49b85">'+deathDirection+'</b>.<br>Survived <b style="color:#e2f17b">'+fmt(elapsed)+'</b> · Eliminations <b style="color:#e2f17b">'+score+'</b>.<br>Headshots '+headshots+' · Personal best '+fmt(peak)+'. One hit is all it takes.';
   $('reticle').classList.add('hidden');
   $('hud').classList.add('hidden');$('battery').classList.add('hidden');$('elims').classList.add('hidden');
   document.body.classList.remove('playing');
  }
 }
}

function dead(attacker){
 if(state!=='playing')return;
 state='dead';shootHeld=false;touchFiring=false;
 try{
  let b=Number(localStorage.getItem('zombiez-record')||0);
  if(elapsed>b){localStorage.setItem('zombiez-record',String(Math.floor(elapsed)));peak=elapsed;}
  else peak=b;
 }catch(e){peak=elapsed;}
 sound('fastzombie1',.65,.86,{x:attacker?.obj.position.x||rig.position.x,y:1.5,z:attacker?.obj.position.z||rig.position.z});
 if(document.pointerLockElement)document.exitPointerLock();
 gun.visible=false;lamp.visible=false;deathPanel.visible=false;vrPanel.visible=false;
 showDeathReplay(attacker);
 notice('FATAL ATTACK '+deathDirection);
}
function paintDeath(){const g=deathCanvas.getContext('2d');g.clearRect(0,0,900,560);g.fillStyle='#030b08ee';g.fillRect(0,0,900,560);g.strokeStyle='#d0f078';g.lineWidth=4;g.strokeRect(8,8,884,544);g.textAlign='center';g.fillStyle='#f98c71';g.font='bold 92px sans-serif';g.fillText('YOU DIED',450,156);g.fillStyle='#e6eecc';g.font='bold 50px monospace';g.fillText('SURVIVED  '+fmt(elapsed),450,252);g.fillStyle='#f6a18d';g.font='bold 28px monospace';g.fillText('ATTACKED '+deathDirection,450,420);g.font='34px monospace';g.fillText('KILLS '+score+'   HEADSHOTS '+headshots,450,320);g.fillText('PERSONAL BEST  '+fmt(peak),450,375);g.fillStyle='#d6ed94';g.font='30px monospace';g.fillText('PRESS RIGHT TRIGGER OR A TO RETRY',450,478);deathTex.needsUpdate=true;}
function paintVR(){const g=gfxCanvas.getContext('2d');g.clearRect(0,0,768,232);g.fillStyle='#030c0aea';g.fillRect(0,0,768,205);g.strokeStyle='#9ba880';g.strokeRect(2,2,764,201);g.fillStyle='#e2f17b';g.font='19px monospace';g.fillText('ZOMBIEZ // THE LAST LIGHT',19,32);g.fillStyle='#f4f4e4';g.font='bold 39px monospace';g.fillText(fmt(elapsed),21,88);g.fillText(''+ammo+'/'+(specs[currentWeapon].mag+bonusMagazine),274,88);g.fillText(Math.ceil(battery)+'%',579,88);g.font='16px monospace';g.fillStyle='#b0bfae';g.fillText('TIME',22,111);g.fillText(currentWeapon.toUpperCase()+' / RELOAD A-B',274,111);g.fillText('LIGHT',581,111);g.fillStyle='#384d36';g.fillRect(20,137,725,12);g.fillStyle=battery<20?'#ff745b':'#e2f17b';g.fillRect(20,137,725*battery/batteryMax,12);g.font='17px monospace';g.fillStyle='#dfebca';g.fillText('WAVE '+wave+'    ELIMINATIONS '+score+'    LEFT TRIGGER · LIGHT ON / OFF',20,183);gfx.needsUpdate=true;}
function updateUI(){if(state!=='playing')return;$('time').textContent=fmt(elapsed);$('wave').textContent='WAVE '+String(wave).padStart(2,'0');$('ammo').textContent=String(ammo).padStart(2,'0');document.querySelector('.stat.right>small').textContent=specs[currentWeapon].label;document.querySelector('.stat.right em').textContent='/ '+(specs[currentWeapon].mag+bonusMagazine);$('batnum').textContent=Math.ceil(battery/batteryMax*100)+'%';$('batfill').style.width=(battery/batteryMax*100)+'%';$('batfill').style.background=battery<15?'#f68465':'#e2f17b';$('bathint').textContent=flashlightOn?'LIGHT ON · SWITCH OFF TO RECHARGE':'RECHARGING · LIGHT OFF';$('kills').textContent=String(score).padStart(2,'0');$('reload').textContent=ammo<=0?'RELOAD NOW':currentWeapon==='smg'?'A / B — RELOAD':'R — RELOAD';$('hp').textContent='1 HIT';$('hpfill').style.width='100%';document.querySelector('.health>small').childNodes[0].textContent='NO SECOND CHANCES ';paintWatch();}
// Quest Touch commonly places the thumbstick on axes 2/3; some WebXR profiles use 0/1.
// Choose whichever stick is actually moving so left-stick movement never appears dead.
function leftStick(gamepad){
 if(!gamepad)return [0,0];
 const a=gamepad.axes||[];
 const primary=[Number(a[2]||0),Number(a[3]||0)];
 const fallback=[Number(a[0]||0),Number(a[1]||0)];
 const axes=(a.length>=4&&Math.hypot(...primary)>.14)?primary:fallback;
 return axes.map(v=>Math.abs(v)<.16?0:clamp(v,-1,1));
}
// A forgiving, frame-independent gesture detector: head-relative controller
// translation and rapid wrist rotation both count. No one-frame 4cm reversals.
function move(dt){
 let ax=0,ay=0;
 if(renderer.xr.isPresenting){
  [ax,ay]=leftStick(left?.userData.input?.gamepad);
const leftButtons=left?.userData.input?.gamepad?.buttons;
  if(leftButtons){
   // Fallback for WebXR browsers that do not dispatch selectstart reliably.
   const trigger=Boolean(leftButtons[0]?.pressed);
   if(trigger&&!leftTriggerHeld)toggleFlashlight();
   leftTriggerHeld=trigger;
   // Meta Touch X and Y buttons (left controller buttons 4 and 5).
   const x=Boolean(leftButtons[4]?.pressed),y=Boolean(leftButtons[5]?.pressed);
   if(x&&!leftXHeld)setBeamMode('focus');
   if(y&&!leftYHeld)setBeamMode('wide');
   leftXHeld=x;leftYHeld=y;
  }
  if(!leftButtons)leftTriggerHeld=false;
  const buttons=right?.userData.input?.gamepad?.buttons;
  if(buttons){
   const pressed=Boolean(buttons[4]?.pressed||buttons[5]?.pressed||buttons[1]?.pressed);
   if(pressed&&!rightReloadHeld){if(state==='dead')startGame();else reload();}
   rightReloadHeld=pressed;
  }
 }else{
  if(held.has('KeyW')||held.has('ArrowUp'))ay=-1;
  if(held.has('KeyS')||held.has('ArrowDown'))ay=1;
  if(held.has('KeyA'))ax=-1;
  if(held.has('KeyD'))ax=1;
  if(isTouchDevice){ax=touchMoveX;ay=touchMoveY;}
 }
 const length=Math.hypot(ax,ay);
 if(length<.1)return;
 ax/=Math.max(1,length);ay/=Math.max(1,length);
 // In WebXR this is the *headset* forward direction, not the left controller or
 // world north. Thumbstick UP is negative Y, so -ay moves along gaze-forward.
 const headCamera=renderer.xr.isPresenting?renderer.xr.getCamera(camera):camera;
 const q=headCamera.getWorldQuaternion(new THREE.Quaternion());
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(q);
 forward.y=0;
 if(forward.lengthSq()<.0001){forward.set(-Math.sin(yaw),0,-Math.cos(yaw));}
 forward.normalize();
 const rightVector=new THREE.Vector3(-forward.z,0,forward.x);
 const speed=2.85*dt;
 rig.position.addScaledVector(forward,-ay*speed);
 rig.position.addScaledVector(rightVector,ax*speed);
 playerMovingUntil=elapsed+.78;
 collideWithTrees();
}
function updateZombies(dt){
 const activelyMoving=elapsed<playerMovingUntil;
 for(let i=zombies.length-1;i>=0;i--){
  const z=zombies[i],pos=z.obj.position;
  let dx=rig.position.x-pos.x,dz=rig.position.z-pos.z,d=Math.hypot(dx,dz);
  if(d>67){
   scene.remove(z.obj);z.mixer.stopAllAction();zombies.splice(i,1);continue;
  }
  if(!z.alerted){
   const hear=activelyMoving?20:11;
   // The gathering horde eventually notices even a stationary survivor;
   // distance-based dread rises instead of zombies suddenly sprinting.
   const pressureRadius=Math.min(42,11+elapsed*.14);
   if(d<pressureRadius)z.alerted=true;
   if(d<hear)z.alerted=true;
   else for(const n of noisePulses){if(Math.hypot(pos.x-n.x,pos.z-n.z)<n.radius){z.alerted=true;break;}}
  }
  if(z.alerted){
   const runBlend=z.kind==='runner'?.25:z.kind==='stalker'?.06:0;
   z.walkAction.setEffectiveWeight(1);
   z.sprintAction.setEffectiveWeight(runBlend);
   z.walkAction.timeScale=z.kind==='shambler'?.56:z.kind==='runner'?1.15:.86;
   z.sprintAction.timeScale=z.kind==='runner'?1.12:.8;
   if(d<.82||d<z.speed*dt*.8){dead(z);break;}
   zombieRoute(z,rig.position.x,rig.position.z,dt*(z.flinch>0?.47:1),z.limp);
   if(!z.hasScreamed&&d<14){
    sound('fastzombie1',.55,rnd(.78,1.22),{x:pos.x,y:1.3,z:pos.z});
    z.hasScreamed=true;
   }
   if(d<3.2){z.attackTimer-=dt;if(z.attackTimer<=0){z.attackTimer=rnd(1.4,2.9);z.attackAction.reset().play();z.attackAction.setEffectiveWeight(.42);}}
   z.attackAction.setEffectiveWeight(Math.max(0,z.attackAction.getEffectiveWeight()-dt*.8));
  }else{
   z.walkAction.setEffectiveWeight(1);z.sprintAction.setEffectiveWeight(0);
   z.attackAction.setEffectiveWeight(0);
   z.roamTimer-=dt;
   if(z.roamTimer<=0){z.roamAngle+=rnd(-1.9,1.9);z.roamTimer=rnd(2.5,6.5);}
   zombieRoute(z,pos.x+Math.sin(z.roamAngle)*4,pos.z+Math.cos(z.roamAngle)*4,dt,.28);
  }
  z.flinch=Math.max(0,z.flinch-dt);
  // Distant locomotion stays active but bone poses update less often, which
  // saves mixer/tracks work as the horde approaches Quest's limit.
  z.animAccum+=dt;
  const stride=d<13?1:d<28?2:4;
  if((i+frame)%stride===0 || z.animAccum>.22){
   z.mixer.update(z.animAccum);z.animAccum=0;
  }
  // No cumulative bone rotations: every frame relies on the zombie's native
  // animation tracks. Procedural + / - deltas previously accumulated and made
  // the neck/head break away from its skeleton.
  z.voice-=dt;
  if(z.voice<0){
   if(d<31&&Math.random()<.58)sound(pick(['z1','z5','z10','z14','z20','growl2','zombienoise3']),z.alerted?.47:.23,rnd(.78,1.22),{x:pos.x,y:1.25,z:pos.z});
   z.voice=rnd(z.alerted?2.9:5.2,z.alerted?6.8:10.2);
  }
 }
 for(let i=noisePulses.length-1;i>=0;i--){noisePulses[i].ttl-=dt;if(noisePulses[i].ttl<=0)noisePulses.splice(i,1);}
 for(let i=particles.length-1;i>=0;i--){
  const p=particles[i];p.age+=dt;p.ttl-=dt;
  if(p.ragdoll){
   p.angularVelocity+=dt*3.0;
   p.ang=Math.min(1.48,p.ang+p.angularVelocity*dt);
   const settle=clamp(p.ang/1.48,0,1);
   if(p.hips){
    p.hips.position.copy(p.hipPosition);
    p.hips.position.y=p.hipPosition.y*(1-settle)+.52*settle;
    const tip=new THREE.Quaternion().setFromEuler(new THREE.Euler(p.dir*p.ang,0,.12*Math.sin(p.age*3)*Math.exp(-p.age*2)));
    p.hips.quaternion.copy(p.hipRotation).multiply(tip);
   }else{
    p.obj.rotation.x=p.dir*p.ang;
   }
   const relax=1-Math.exp(-p.age*2.7);
   for(const q of p.joints){
    const desired=q.from.clone().multiply(q.offset);
    q.bone.quaternion.copy(q.from).slerp(desired,relax);
   }
  }else if(p.mixer)p.mixer.update(dt);
  if(p.ttl<=0){scene.remove(p.obj);particles.splice(i,1);}
 }
 updateImpactEffects(dt);
}

function updatePickups(dt){
 for(let i=pickups.length-1;i>=0;i--){
  const p=pickups[i];p.age+=dt;
  p.glow.intensity=.17+.07*Math.sin(p.age*2.4);
  p.icon.position.y=.52+.035*Math.sin(p.age*2.1);
  if(Math.hypot(p.g.position.x-rig.position.x,p.g.position.z-rig.position.z)<1.15)grab(p);
  else if(p.age>55){scene.remove(p.g);pickups.splice(i,1);}
 }
}

$('start').addEventListener('click',async()=>{if(!zombieTemplate){$('startlabel').textContent='LOADING MODEL...';await modelReady;}if(zombieTemplate)startGame();});
renderer.xr.addEventListener('sessionstart',async()=>{document.body.classList.add('xr-presenting');if(!zombieTemplate)await modelReady;if(zombieTemplate)startGame();});
renderer.xr.addEventListener('sessionend',()=>{clearDeathReplay();deathReady=true;gun.visible=true;lamp.visible=true;document.body.classList.remove('xr-presenting');shootHeld=false;vrPanel.visible=false;deathPanel.visible=false;if(state==='playing'||state==='dead'){state='menu';$('menu').classList.remove('off');document.body.classList.remove('playing');$('startlabel').textContent='ENTER THE FOREST';}});
renderer.domElement.addEventListener('mousedown',e=>{if(e.button!==0||renderer.xr.isPresenting)return;if(state==='dead'){startGame();return;}if(state!=='playing')return;if(isTouchDevice)return;if(document.pointerLockElement!==renderer.domElement){renderer.domElement.requestPointerLock?.();return;}fire();shootHeld=true;});
document.addEventListener('mouseup',()=>shootHeld=false);
document.addEventListener('mousemove',e=>{if(isTouchDevice||document.pointerLockElement!==renderer.domElement||renderer.xr.isPresenting)return;yaw-=e.movementX*.00225;pitch=clamp(pitch-e.movementY*.0022,-1.2,1.2);camera.rotation.set(pitch,yaw,0);});
document.addEventListener('keydown',e=>{held.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyR')reload();if(e.code==='KeyQ')toggleBeam();if(e.code==='KeyF'&&!e.repeat&&state==='playing')toggleFlashlight();if(e.code==='Enter'&&state==='dead')startGame();});
document.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function loop(now){const wallDt=Math.min(.9,Math.max(0,(now-lastTime)/1000||.016));const dt=Math.min(.18,wallDt);lastTime=now;frame++;
 if(state==='playing'){elapsed+=wallDt;wave=2+Math.floor(elapsed/30);weaponCooldown=Math.max(0,weaponCooldown-wallDt);reloadCooldown=Math.max(0,reloadCooldown-wallDt);if(reloadCooldown===0&&window.reloadPending){ammo=specs[currentWeapon].mag+bonusMagazine;window.reloadPending=false;}
 if(reloadCooldown>0)window.reloadPending=true;
 if((shootHeld||touchFiring)&&currentWeapon==='smg'&&weaponCooldown<=0)fire();
 // Charging happens automatically whenever the flashlight is switched off.
 adaptCrowd(wallDt);move(dt);updateZombies(dt);if(state==='playing'){updatePickups(dt);if(elapsed>nextAheadCheck){keepForestPopulatedAhead();nextAheadCheck=elapsed+3.4;}if(elapsed>nextSpawn){populateReplacement();if(elapsed>60||elapsed<playerMovingUntil)populateReplacement();if(elapsed>180)populateReplacement();nextSpawn=elapsed+Math.max(.55,2.15-wave*.095)+rnd(-.22,.25);}
 if(elapsed>nextDrop){let kind=elapsed<45?'flash':elapsed<80?'shotgun':elapsed<115?'smg':pick(['flash','shotgun','smg','ammo','ammo']);makePickup(kind);nextDrop=elapsed+Math.max(23,31-wave);}
 updateFlashlightBattery(wallDt);
 if(++treeTick%47===0)maintainForest();updateMuzzleFlash(dt);const lightPower=flashlightOn&&battery>0?.82+.18*Math.min(1,battery/(batteryMax*.15)):0;
 light.intensity=(beamMode==='focus'?205:155)*lightPower;
 light.distance=beamMode==='focus'?flashRange:flashRange*.61;
 spill.intensity=(beamMode==='focus'?25:48)*lightPower;
 spill.distance=beamMode==='focus'?Math.max(9,flashRange*.48):Math.max(8,flashRange*.56);
 if(battery<12&&Math.random()<.018){light.intensity*=.4;spill.intensity*=.45;}
 uiClock+=dt;if(uiClock>.16){uiClock=0;updateUI();}
 }}else{light.intensity=state==='menu'?38:7;spill.intensity=state==='menu'?15:2;}
 if(state==='dead'&&deathReady&&renderer.xr.isPresenting){const buttons=right?.userData.input?.gamepad?.buttons;if(buttons){const yes=Boolean(buttons[4]?.pressed||buttons[5]?.pressed);if(yes&&!rightRetryHeld)startGame();rightRetryHeld=yes;}}
 if(state==='dead')updateDeathReplay(wallDt);if(state!=='playing')muzzleTime=0;updateAvatar();updateLaser();listenerUpdate();updateNotice();renderer.render(scene,camera);}
renderer.setAnimationLoop(loop);
vrPanel.visible=false;
document.querySelector('.health>small').childNodes[0].textContent='NO SECOND CHANCES ';
$('hp').textContent='1 HIT';

