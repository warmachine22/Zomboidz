// Snapshot the compiled, running Zomboidz prototype and its packaged runtime
// assets from the player's Vercel deployment. Do not use on unrelated URLs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.env.ZOMBOIDZ_SOURCE_URL || 'https://zombiez.vercel.app').replace(/\/$/, '');

const audio = [
  'fastzombie1','growl2','pistol','pump','reload-short','reload-smg-short',
  'shotgun','smg','z1','z5','z10','z14','z20','zombienoise3'
];
const paths = [
  'index.html', 'style.css', 'game.js', 'game.js.gz', 'SPEC.md', 'CREDITS.md',
  ...Array.from({length:15},(_,i)=>`assets/npc-part-${i}.bin`),
  ...audio.map(name=>`assets/audio/${name}.ogg`)
];
async function download(file){
  const url = new URL(file, base + '/').href;
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if(!response.ok)throw new Error(`Failed ${response.status}: ${url}`);
  const body=Buffer.from(await response.arrayBuffer());
  if(!body.length)throw new Error('Empty download: ' + url);
  const target=join(root,file);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,body);
  console.log(`Fetched ${file} (${body.length} bytes)`);
}
for(const file of paths) await download(file);
const packed = await readFile(join(root,'game.js.gz'));
const source = gunzipSync(packed).toString('utf8');
if(!source.includes('function traceBallistic(') || !source.includes('function startGame(')) {
  throw new Error('Downloaded game runtime did not contain expected gameplay source.');
}
await mkdir(join(root,'src'),{recursive:true});
await writeFile(join(root,'src/game.js'),source);
console.log(`Restored editable src/game.js (${source.length} chars); ${paths.length} runtime files synced.`);
