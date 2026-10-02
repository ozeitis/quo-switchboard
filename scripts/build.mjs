import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/renderer', { recursive: true });
if (process.platform === 'darwin') {
  const sdkVersion = execFileSync('xcrun', ['--show-sdk-version'], { encoding: 'utf8' }).trim();
  if (Number(sdkVersion.split('.')[0]) < 27) throw new Error('Building Switchboard requires Xcode 27 and the macOS 27 SDK. Select it with xcode-select.');
  await mkdir('dist/native', { recursive: true });
  execFileSync('xcrun', ['clang++', '-std=c++20', '-fobjc-arc', '-O2', '-Wall', '-Wextra', '-Wno-unused-parameter',
    '-shared', '-undefined', 'dynamic_lookup', '-framework', 'AppKit', '-framework', 'QuartzCore', '-I', 'node_modules/node-api-headers/include',
    '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=13.0',
    'native/shell.mm', '-o', 'dist/native/shell.node'], { stdio: 'inherit' });
}
await Promise.all([
  build({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node24', sourcemap: true }),
  ...['shell', 'account'].map(name => build({ entryPoints: [`src/preload/${name}.ts`], outfile: `dist/${name}-preload.cjs`, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node24' })),
  build({ entryPoints: ['src/renderer/index.ts'], outfile: 'dist/renderer/index.js', bundle: true, platform: 'browser', target: 'chrome140', sourcemap: true }),
  cp('src/renderer/index.html', 'dist/renderer/index.html'),
  cp('src/renderer/style.css', 'dist/renderer/style.css'),
  cp('assets/tray.png', 'dist/tray.png')
]);
