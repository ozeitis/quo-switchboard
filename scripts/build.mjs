import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/renderer', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node24', sourcemap: true }),
  ...['shell', 'account'].map(name => build({ entryPoints: [`src/preload/${name}.ts`], outfile: `dist/${name}-preload.cjs`, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node24' })),
  build({ entryPoints: ['src/renderer/index.ts'], outfile: 'dist/renderer/index.js', bundle: true, platform: 'browser', target: 'chrome140', sourcemap: true }),
  cp('src/renderer/index.html', 'dist/renderer/index.html'),
  cp('src/renderer/style.css', 'dist/renderer/style.css'),
  cp('assets/tray.png', 'dist/tray.png')
]);
