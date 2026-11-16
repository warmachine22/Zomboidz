import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'game.js'));

// Match the production artifact byte-for-byte on systems with gzip installed.
// Fall back to Node's zlib on systems without that command; both outputs are valid.
const command = spawnSync('gzip', ['-n', '-9', '-c'], {
  input: source,
  maxBuffer: 16 * 1024 * 1024,
});
const packed = !command.error && command.status === 0
  ? command.stdout
  : gzipSync(source, { level: 9 });

await writeFile(path.join(root, 'game.js.gz'), packed);
console.log(`Built game.js.gz (${source.length} → ${packed.length} bytes)`);
