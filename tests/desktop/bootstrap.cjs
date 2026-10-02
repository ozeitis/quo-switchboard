const { app } = require('electron');
const { readFileSync } = require('node:fs');

if (!process.env.SWITCHBOARD_TEST_DATA || !process.env.SWITCHBOARD_TEST_FIXTURE) throw new Error('The desktop test bootstrap requires an isolated fixture profile.');
const html = readFileSync(process.env.SWITCHBOARD_TEST_FIXTURE, 'utf8');
const handled = new Set();
if (process.platform === 'darwin') {
  const nativePath = require.resolve('../../dist/native/shell.node');
  const native = require(nativePath);
  const bridge = Object.create(native);
  globalThis.nativeStatus = {};
  Object.defineProperty(bridge, 'statusAttach', { value: callback => { globalThis.nativeStatusAction = callback; native.statusAttach(callback); } });
  Object.defineProperty(bridge, 'statusUpdate', { value: json => { globalThis.nativeStatus = JSON.parse(json); native.statusUpdate(json); } });
  globalThis.nativeStatusInspect = () => JSON.parse(native.statusInspect());
  globalThis.nativeCallsInspect = () => JSON.parse(native.callsInspect());
  Object.defineProperty(bridge, 'callsAttach', { value: callback => { globalThis.nativeCallAction = callback; native.callsAttach(callback); } });
  Object.defineProperty(bridge, 'environment', { value: () => ({ ...native.environment(), ...(typeof globalThis.fixtureReduceMotion === 'boolean' ? { reduceMotion: globalThis.fixtureReduceMotion } : {}) }) });
  require.cache[nativePath].exports = bridge;
}
// Register before the production entry point creates any account views.
app.on('web-contents-created', (_event, contents) => {
  const profile = contents.session;
  if (handled.has(profile)) return;
  handled.add(profile);
  profile.protocol.handle('https', request => {
    if (process.env.SWITCHBOARD_TEST_WORKER && new URL(request.url).pathname === '/sw.js') {
      return new Response(readFileSync(process.env.SWITCHBOARD_TEST_WORKER, 'utf8'), { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' } });
    }
    const body = new URL(request.url).origin === 'https://signin.openphone.com'
      ? '<!doctype html><h1>Quo sign-in fixture</h1><a href="https://my.quo.com/auth/authorize?code=fixture">Complete sign-in</a>'
      : html;
    return new Response(body, { headers: { 'Content-Type': 'text/html' } });
  });
});

require('../../dist/main.cjs');
