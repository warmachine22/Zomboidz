import * as THREE from 'three';

const forward = new THREE.Vector3(0, 0, -1);
const wristPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -.12);
const names = ['pistol', 'shotgun', 'smg', 'flashlight', 'glove'];

export function toolLayouts(art) {
  return Object.fromEntries(names.map(name => {
    const scene = art[name].scene;
    scene.updateMatrixWorld(true);
    const socket = label => {
      const node = scene.getObjectByName(label);
      if (!node) throw Error(name + ' is missing ' + label);
      return scene.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
    };
    const scale = name === 'pistol' ? .94 : 1;
    const offset = socket(name === 'glove' ? 'GloveSocket' : 'GripSocket').multiplyScalar(-scale);
    if (name === 'pistol') offset.y -= .015;
    if (name === 'smg' || name === 'shotgun') offset.y -= .009;
    const muzzle = name === 'glove' ? null : socket('MuzzleSocket').multiplyScalar(scale).add(offset);
    return [name, { scale, offset, muzzle }];
  }));
}

export function heldPose(pose, weapon, stereo) {
  if (!pose || !stereo) return pose;
  return {
    position: pose.position.clone().add(new THREE.Vector3(0,-.012,-.008).applyQuaternion(pose.quaternion)),
    quaternion: weapon ? pose.quaternion.clone().multiply(wristPitch) : pose.quaternion,
  };
}

export function mountedAim(pose, layout, view, converge) {
  if (!pose) return undefined;
  const origin = layout.muzzle.clone().applyQuaternion(pose.quaternion).add(pose.position);
  const ray = converge
    ? view.position.clone().addScaledVector(forward.clone().applyQuaternion(view.quaternion), 27).sub(origin).normalize()
    : forward.clone().applyQuaternion(pose.quaternion);
  return { origin, ray, viewOrigin: view?.position };
}
