import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'game.js'));
const packed = gzipSync(source, { level: 9, mtime: 0 });
await writeFile(path.join(root, 'game.js.gz'), packed);
console.log(`Built game.js.gz (${source.length} → ${packed.length} bytes)`);
