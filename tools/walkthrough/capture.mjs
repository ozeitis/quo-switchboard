import { _electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { QUO_LIGHT, QUO_DARK } from '../../src/preload/theme-contract.ts';
import { emptyConfig } from '../../src/shared/model.ts';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, process.argv[2] ?? 'release/walkthrough/captures');
if (!output.startsWith(`${root}/release/`)) throw new Error('Capture output must stay under ignored release/.');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'switchboard-demo-'));
const html = (await readFile(join(import.meta.dirname, 'fixture.html'), 'utf8'))
  .replace('/* DEMO_COLOR_CONTRACT */', [QUO_LIGHT, QUO_DARK].map((values, mode) =>
    `.provider-${mode ? 'dark' : 'light'} { ${values.map((value, i) => `--demo-color-${i.toString(36)}:${value};`).join('')} }`).join('\n'));
await writeFile(join(profile, 'fixture.html'), html, { mode: 0o600 });
const config = emptyConfig();
config.sidebarCollapsed = true;
config.accounts = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Studio', color: 'violet' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Workshop', color: 'blue' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Field Team', color: 'green' }
];
config.activeId = config.accounts[0].id;
config.preferences.menuBarCount = true;
await writeFile(join(profile, 'workspaces.json'), JSON.stringify(config), { mode: 0o600 });
const app = await _electron.launch({ args: [join(root, 'tests/desktop/bootstrap.cjs'),
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  env: { ...process.env, SWITCHBOARD_TEST_DATA: profile,
    SWITCHBOARD_TEST_FIXTURE: join(profile, 'fixture.html'), SWITCHBOARD_TEST_SHELL: 'native' } });
const shell = await app.firstWindow();
const command = value => shell.evaluate(value => window.switchboard.command(value), value);
const snapshot = () => shell.evaluate(() => window.switchboard.snapshot());
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const findWindows = () => JSON.parse(execFileSync(join(output, 'windows'), [String(app.process().pid)], { encoding: 'utf8' }));
const shots = [];
async function capture(name, filter = window => window.bounds.Width === 1280) {
  await delay(450);
  let windows = findWindows();
  const isTarget = window => window.name !== 'Switchboard demo backdrop' && filter(window);
  let matches = windows.filter(isTarget);
  if (!matches.length) {
    await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()
      .find(window => window.getTitle() !== 'Switchboard demo backdrop').show(); });
    await delay(300);
    windows = findWindows(); matches = windows.filter(isTarget);
  }
  if (matches.length !== 1) throw new Error(`Expected one demo window for ${name}: ${JSON.stringify(windows)}`);
  const window = matches[0];
  const path = join(output, `${name}.png`);
  if (name === '05-call-sheet' || name === '12-menu-activity') {
    // ScreenCaptureKit includes only this process's panel and plain backdrop.
    execFileSync(join(output, 'windows'), [String(app.process().pid), '--capture-glass', String(window.id), path], { timeout: 15000 });
  } else {
    execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', String(window.id), path]);
  }
  const parent = windows.find(window => window.bounds.Width === 1280 && window.name !== 'Switchboard demo backdrop');
  execFileSync('python3', ['-c', `
from PIL import Image
import json, sys
path, child, parent = sys.argv[1], json.loads(sys.argv[2]), json.loads(sys.argv[3])
image = Image.open(path)
if image.width / image.height != child['Width'] / child['Height']:
    if abs(image.width / image.height - parent['Width'] / parent['Height']) > .01:
        raise SystemExit('Unexpected window capture dimensions')
    scale = image.width / parent['Width']
    x, y = (child['X'] - parent['X']) * scale, (child['Y'] - parent['Y']) * scale
    image = image.crop((round(x), round(y), round(x + child['Width'] * scale), round(y + child['Height'] * scale)))
image.save(path)
`, path, JSON.stringify(window.bounds), JSON.stringify(parent?.bounds ?? window.bounds)]);
  shots.push({ name, bounds: window.bounds, file: `${name}.png` });
  console.log(`Captured ${name}.`);
}
try {
  execFileSync('xcrun', ['swiftc', join(import.meta.dirname, 'windows.swift'), '-o', join(output, 'windows')]);
  await app.evaluate(async ({ app, BrowserWindow, nativeTheme, Notification, screen }) => {
    nativeTheme.themeSource = 'light';
    Notification.prototype.show = function () { this.emit('show'); };
    Notification.prototype.close = function () { this.emit('close'); };
    const main = BrowserWindow.getAllWindows()[0];
    const bounds = screen.getPrimaryDisplay().bounds;
    const backdrop = new BrowserWindow({ ...bounds, frame: false, show: false, skipTaskbar: true,
      backgroundColor: '#e8ecf2', title: 'Switchboard demo backdrop',
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
    await backdrop.loadURL('data:text/html,<html><body style="margin:0;background:%23e8ecf2"></body></html>');
    backdrop.showInactive();
    main.setBounds({ x: bounds.x + 100, y: bounds.y + 160, width: 1280, height: 700 });
    app.focus({ steal: true }); main.show(); main.focus();
  });
  execFileSync(join(output, 'windows'), [String(app.process().pid), '--activate']);
  const pages = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = app.context().pages().filter(page => page.url().startsWith('https://my.quo.com'));
    if (current.length === 3) { pages.push(...current); break; }
    await delay(100);
  }
  if (pages.length !== 3) throw new Error('Demo workspace views did not load.');
  const contents = await app.evaluate(({ webContents }) => webContents.getAllWebContents()
    .filter(contents => contents.getURL().startsWith('https://my.quo.com'))
    .map(contents => ({ id: contents.id, profile: contents.session.getStoragePath() })));
  for (const account of config.accounts) {
    const entry = contents.find(contents => contents.profile.includes(account.id));
    if (!entry) throw new Error(`Missing isolated profile for ${account.name}.`);
    // The fixture's identity comes from the owning session, never initial page order.
    await app.evaluate(({ webContents }, value) => webContents.fromId(value.id).executeJavaScript(`window.demo.setWorkspace(${JSON.stringify(value.name)}, ${value.unread})`),
      { id: entry.id, name: account.name, unread: [3, 7, 2][config.accounts.indexOf(account)] });
  }
  const workspaceContents = id => contents.find(contents => contents.profile.includes(id)).id;
  const runInWorkspace = (id, expression) => app.evaluate(({ webContents }, value) => webContents.fromId(value.id).executeJavaScript(value.expression), { id: workspaceContents(id), expression });
  await delay(800);
  await capture('01-studio');
  await command({ type: 'select', id: config.accounts[1].id });
  await capture('02-workshop');
  await command({ type: 'select', id: config.accounts[2].id });
  await capture('03-field-team');
  await command({ type: 'select', id: config.accounts[0].id });
  await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); const main = BrowserWindow.getAllWindows()
    .find(window => window.getTitle() !== 'Switchboard demo backdrop'); main.show(); main.focus(); });
  await delay(300);
  await capture('04-call-base');
  await runInWorkspace(config.accounts[1].id, 'window.demo.ring()');
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await snapshot()).incomingCalls?.length) break;
    await delay(100);
  }
  await capture('05-call-sheet', window => window.bounds.Width > 350 && window.bounds.Width < 900 && window.name !== 'Switchboard demo backdrop');
  const call = (await snapshot()).incomingCalls[0];
  if (!call || call.name !== 'Workshop') throw new Error('Demo call was not routed from Workshop.');
  await app.evaluate((_electron, value) => globalThis.nativeCallAction(JSON.stringify(value)),
    { type: 'call-action', id: call.id, callId: call.callId, action: 'answer' });
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await snapshot()).activeId === config.accounts[1].id) break;
    await delay(100);
  }
  if ((await snapshot()).activeId !== config.accounts[1].id || await runInWorkspace(config.accounts[1].id, 'document.body.dataset.answered') !== 'yes') throw new Error('Demo answer did not open and answer Workshop.');
  await capture('06-call-answered');
  await runInWorkspace(config.accounts[1].id, 'window.demo.end()');
  await command({ type: 'save-theme', id: config.accounts[1].id, theme: { preset: 'iris', mode: 'dark' } });
  await command({ type: 'workspace-theme', id: config.accounts[1].id });
  await capture('07-theme-base');
  await capture('08-theme-picker', window => window.bounds.Width > 450 && window.bounds.Width < 700 && window.name !== 'Switchboard demo backdrop');
  await app.evaluate((_electron, path) => process.getBuiltinModule('module').createRequire(path)(path).dismiss(), join(root, 'dist/native/shell.node'));
  await command({ type: 'save-theme', id: config.accounts[1].id, theme: { preset: 'iris', mode: 'dark' } });
  await capture('09-theme-dark');
  await command({ type: 'select', id: config.accounts[0].id });
  await capture('10-theme-isolation');
  await runInWorkspace(config.accounts[2].id, 'window.demo.notify()');
  await command({ type: 'activity' });
  await capture('11-menu-base');
  await capture('12-menu-activity', window => window.bounds.Width > 330 && window.bounds.Width < 410 && window.name !== 'Switchboard demo backdrop');
  await writeFile(join(output, 'shots.json'), JSON.stringify({ data: 'Synthetic only; no live Quo data or call audio.', appVersion: '0.5.2', shots }, null, 2) + '\n');
  console.log('All captures contain only the isolated demo profile.');
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }).catch(() => {});
  await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
