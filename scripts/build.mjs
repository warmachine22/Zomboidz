import { cp, mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, context } from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const development = process.argv.includes('--dev');
const out = path.join(root, development ? '.cache/zomboidz' : 'dist');

await mkdir(out, { recursive: true });
const publicPaths = ['index.html', 'style.css', 'assets/art', 'assets/audio'];
const copy = p => cp(path.join(root, p), path.join(out, p), { recursive: true });
await Promise.all(publicPaths.map(copy));

const options = {
  absWorkingDir: root,
  entryPoints: ['game.js'],
  outfile: path.join(out, 'game.js'),
  target: ['es2022'],
  format: 'esm',
  bundle: true,
  sourcemap: development,
  minify: !development,
  legalComments: 'linked',
  define: { __DEVELOPMENT__: String(development) },
  logLevel: 'info',
};
if (development) {
  const server = await context(options);
  await server.watch();
  for (const p of publicPaths) {
    let timer;
    watch(path.join(root, p), () => {
      clearTimeout(timer);
      timer = setTimeout(() => copy(p).catch(error => console.warn(error.message)), 120);
    });
  }
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  await server.serve({ servedir: out, port, host });
} else await build(options);
