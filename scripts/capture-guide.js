import * as THREE from 'three';
import { toolLayouts } from '../src/held-tools.js';
import { createPresentation, loadArt } from '../src/presentation.js';
import { addEnemy, createRun, ENEMIES } from '../src/simulation.js';

const subjects = { shambler:'Shambler', shrieker:'Shrieker', brute:'Brute',
  workshop:'Ranger Quarters', 'lean-to':'Survey Hut', radio:'Assembled extraction radio' };
const art = await loadArt();
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setSize(960,600);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.07;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(45,960/600,.044,95);
const presentation = createPresentation(scene,art,toolLayouts(art));
const fill = new THREE.HemisphereLight(0xb5c5e0,0x4d4939,.52);
const radioLight = new THREE.DirectionalLight(0xffe7bf,0);
scene.add(fill,radioLight,radioLight.target);

function setView(run, position, target) {
  Object.assign(run.player,{ x:position.x,z:position.z,y:run.world.height(position.x,position.z) });
  camera.position.copy(position);
  camera.lookAt(target);
}

function enemyPortrait(run, kind) {
  const { world } = run;
  const center = new THREE.Vector3(0,world.height(0,17)+ENEMIES[kind].height*.5,17);
  setView(run,new THREE.Vector3(0,center.y+.12,20.2),center);
  for (const [i,x] of [-.68,.68].entries()) {
    const enemy = addEnemy(run,kind,x,17);
    enemy.appearance = i ? kind+'-alt' : kind;
    enemy.yaw += i ? -.18 : .23;
    enemy.stride = .74;
    enemy.moveSpeed = .74;
    enemy.gait = i ? 2.1 : .6;
  }
  fill.intensity = .82;
  camera.fov = 45;
}

function buildingPortrait(run, subject) {
  const { world } = run;
  const site = world.map.shelters.find(s=>s.name===(subject==='lean-to'?'Survey Hut':'Ranger Quarters'));
  const sign = Math.sign(site.door.z-site.z);
  if (subject === 'radio') {
    const radio = {...site.part,y:world.height(site.part.x,site.part.z),turn:site.turn};
    run.search.radio = radio;
    const at = new THREE.Vector3(radio.x,radio.y+.03,radio.z);
    setView(run,new THREE.Vector3(radio.x+.38,radio.y+1.12,radio.z+.95),at.add(new THREE.Vector3(0,.5,0)));
    camera.fov = 40;
    fill.intensity = 1.04;
    radioLight.position.copy(camera.position).add(new THREE.Vector3(0,.7,0));
    radioLight.target.position.copy(at);
    radioLight.intensity = 2.0;
    return;
  }
  const target = new THREE.Vector3(site.x,world.height(site.x,site.z)+1.05,site.z);
  const positions = [4.0,-4.0,2.8,-2.8,0].map(offset=>{
    const x = site.door.x+offset, z = site.door.z+sign*11.5;
    return new THREE.Vector3(x,world.height(x,z)+1.7,z);
  });
  const eye = positions.find(point=>world.clear(point,{ ...site.door,y:target.y })) ?? positions.at(-1);
  setView(run,eye,target);
  fill.intensity = 1.05;
  camera.fov = 39;
}

const menu = document.getElementById('subject');
const save = document.getElementById('save');
const status = document.getElementById('status');
menu.replaceChildren(...Object.entries(subjects).map(([value,label])=>new Option(label,value)));
const requested = new URLSearchParams(location.search).get('subject');
if (Object.hasOwn(subjects,requested)) menu.value = requested;

function draw() {
  const enemy = Object.hasOwn(ENEMIES,menu.value);
  const run = createRun('Blackwater',{populate:false,crafted:!enemy});
  run.loot.length = 0;
  radioLight.intensity = 0;
  if (enemy) enemyPortrait(run,menu.value);
  else buildingPortrait(run,menu.value);
  camera.updateProjectionMatrix();
  const ray = camera.getWorldDirection(new THREE.Vector3());
  const beam = menu.value === 'radio' ? null
    : { origin:camera.position.clone().addScaledVector(ray,enemy ? -1.15 : 0), ray, range:20, angle:.58 };
  presentation.update(run,0,{ visibility:true },{},{
    active:false, inspecting:false, stereo:false, calibration:false, menu:false, beam,
    viewpoint:camera.position, enemyAlpha:1,
  });
  renderer.render(scene,camera);
  status.textContent = subjects[menu.value] + ' ready';
  save.disabled = false;
}

save.addEventListener('click',()=>{
  const name = menu.value;
  renderer.domElement.toBlob(blob=>{
    if (!blob || blob.type !== 'image/webp') { status.textContent = 'WebP export failed'; return; }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name + '.webp';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  },'image/webp',.88);
});
menu.addEventListener('change',draw);
draw();
