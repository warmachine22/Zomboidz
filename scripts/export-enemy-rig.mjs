import { readFile, writeFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = new URL('../', import.meta.url);
const meta = JSON.parse(await readFile(new URL('art-source/enemy-rig.json', root), 'utf8'));
const rig = {};
for (const [kind, authored] of Object.entries(meta)) {
  const bytes = await readFile(new URL('assets/art/' + kind + '.glb', root));
  const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  model.scene.updateMatrixWorld(true);
  let skeleton;
  model.scene.traverse(node => { if (node.isSkinnedMesh) skeleton = node.skeleton; });
  if (!skeleton) throw Error('Missing skin for ' + kind);
  const bones = [...skeleton.bones].sort((a, b) => depth(a) - depth(b));
  const indices = new Map(bones.map((bone, index) => [bone.name, index]));
  const anchors = authored.anchors.map(([name, point]) => {
    const bone = bones[indices.get(name)];
    const inverse = skeleton.boneInverses[skeleton.bones.indexOf(bone)];
    return [indices.get(name), ...new Vector3(...point).applyMatrix4(inverse).toArray().map(value => +value.toFixed(5))];
  });
  const clips = {};
  for (const [name, frames] of Object.entries(authored.frames)) {
    const clip = model.animations.find(animation => animation.name === name);
    if (!clip) throw Error(kind + ' is missing ' + name);
    const tracks = new Map(clip.tracks.map(track => [track.name, track.createInterpolant()]));
    const samples = Buffer.alloc((frames + 1) * bones.length * 7 * 2);
    let offset = 0;
    for (let frame = 0; frame <= frames; frame++) {
      const time = clip.duration * frame / frames;
      for (const bone of bones) {
        for (const prop of ['position', 'quaternion']) {
          const values = tracks.get(bone.name + '.' + prop)?.evaluate(time) ?? bone[prop].toArray();
          for (const value of values) {
            const sample = Math.round(value * 10000);
            if (Math.abs(sample) > 32767) throw Error('Pose exceeds packing range');
            samples.writeInt16LE(sample, offset);
            offset += 2;
          }
        }
      }
    }
    clips[name] = { frames, samples: samples.toString('base64') };
  }
  rig[kind] = { bones: bones.map(bone => bone.name), parents: bones.map(bone => indices.get(bone.parent.name) ?? -1),
    radii: authored.radii, anchors, clips, contact: authored.contact, stride: authored.stride };
}
await writeFile(new URL('src/enemy-rigs.js', root),
  '// Generated from the shipped GLBs by scripts/export-enemy-rig.mjs.\nexport const ENEMY_RIGS = '
  + JSON.stringify(rig) + ';\n');

function depth(bone) {
  let count = 0;
  while (bone.parent?.isBone) { count++; bone = bone.parent; }
  return count;
}
