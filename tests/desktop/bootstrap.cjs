const { app, Tray } = require('electron');
const { readFileSync } = require('node:fs');

if (!process.env.SWITCHBOARD_TEST_DATA || !process.env.SWITCHBOARD_TEST_FIXTURE) throw new Error('The desktop test bootstrap requires an isolated fixture profile.');
const html = readFileSync(process.env.SWITCHBOARD_TEST_FIXTURE, 'utf8');
const handled = new Set();
const setContextMenu = Tray.prototype.setContextMenu;
const setImage = Tray.prototype.setImage;
globalThis.trayMenus = [];
globalThis.trayImages = new WeakMap();
Tray.prototype.setImage = function (image) {
  globalThis.trayImages.set(this, image);
  return setImage.call(this, image);
};
Tray.prototype.setContextMenu = function (menu) {
  globalThis.trayMenus.push({ tray: this, menu });
  return setContextMenu.call(this, menu);
};

// Register before the production entry point creates any account views.
app.on('web-contents-created', (_event, contents) => {
  const profile = contents.session;
  if (handled.has(profile)) return;
  handled.add(profile);
  profile.protocol.handle('https', request => {
    const body = new URL(request.url).origin === 'https://signin.openphone.com'
      ? '<!doctype html><h1>Quo sign-in fixture</h1><a href="https://my.quo.com/auth/authorize?code=fixture">Complete sign-in</a>'
      : html;
    return new Response(body, { headers: { 'Content-Type': 'text/html' } });
  });
});

require('../../dist/main.cjs');
