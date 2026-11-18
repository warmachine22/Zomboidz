import { writeFile } from 'node:fs/promises';
import { CHUNK, createWorld, distance } from '../src/world.js';
import { nearestPlateauTrack } from '../src/plateau.js';

const world=createWorld('tree-posts',{plateau:true});
const cells=world.map.size/CHUNK, posts=[];
let large=0;
const round=value=>Number(value.toFixed(3));
for (let z=0;z<cells;z++) for (let x=0;x<cells;x++) {
  const tile=world.chunk(x,z);
  for (const [index,tree] of tile.trees.entries()) {
    if (tree.r<.65) continue;
    large++;
    const approach=nearestPlateauTrack(tree.x,tree.z);
    const away=Math.atan2(tree.z-approach.z,tree.x-approach.x);
    for (const turn of [0,.28,-.28,.53,-.53,.77,-.77,1.06,-1.06]) {
      const angle=away+turn, offset=tree.r+.43;
      const at={x:tree.x+Math.cos(angle)*offset,z:tree.z+Math.sin(angle)*offset};
      if (world.blocks(at.x,at.z,.37) || world.map.starts.some(s=>distance(s,at)<5.5) ||
          world.map.shelters.some(s=>distance(s,at)<8.1)) continue;
      const eye={...at,y:world.height(at.x,at.z)+1.25};
      const probe={x:tree.x-Math.cos(angle)*3,z:tree.z-Math.sin(angle)*3};
      if (world.clear({...probe,y:world.height(probe.x,probe.z)+1.3},eye,false)) continue;
      posts.push([tile.key+':'+index,round(at.x),round(at.z),round(tree.x),round(tree.z),round(tree.r)]);
      break;
    }
  }
}
const header='// Generated with node scripts/build-tree-posts.mjs. Coordinates in metres.\n';
const body=posts.map(row=>'  '+JSON.stringify(row)).join(',\n');
await writeFile(new URL('../src/tree-posts.js',import.meta.url),
  header+'export const LARGE_TREE_COUNT = '+large+';\nexport const TREE_POSTS = [\n'+body+'\n];\n');
console.log(large+' large trees, '+posts.length+' usable posts');
