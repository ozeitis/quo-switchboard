import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerMonitor, powerSaveBlocker, shell, Tray, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Accounts } from './accounts';
import { Notifications } from './notifications';
import { appOrigin, cleanText, RateLimit } from './policy';
import { Store } from './store';
import { validColor, validId, validName, validPreferences, type ShellCommand, type Snapshot } from '../shared/model';

app.setName('Switchboard');
app.setPath('userData', !app.isPackaged && process.env.SWITCHBOARD_TEST_DATA
  ? process.env.SWITCHBOARD_TEST_DATA : join(app.getPath('appData'), 'Switchboard'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let window: BrowserWindow;
let store: Store;
let accounts: Accounts;
let notifications: Notifications;
let tray: Tray;
let quitting = false;
let quitPrompt = false;
let overlay = false;
let notificationError = false;
let sleepBlocker: number | null = null;
const rate = new RateLimit(20, 10_000);
const shellURL = pathToFileURL(join(__dirname, 'renderer/index.html')).href;
const releasesURL = 'https://github.com/ozeitis/quo-switchboard/releases';

function snapshot(): Snapshot {
  return {
    accounts: store.value.accounts.map(account => accounts.entries.get(account.id)?.state ?? { ...account, status: 'loading', unread: 0, ringing: false, inCall: false }),
    activeId: store.value.activeId,
    preferences: store.value.preferences,
    notificationError,
    version: app.getVersion()
  };
}

function show(): void {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function select(id: string, focus = true): void {
  if (!accounts.entries.has(id)) return;
  store.save({ ...store.value, activeId: id });
  overlay = false;
  window.webContents.send('shell:intent', 'close-overlay');
  publish();
  if (focus) { show(); accounts.entries.get(id)?.view.webContents.focus(); }
}

function intent(value: string): void {
  show();
  overlay = true;
  accounts.layout(store.value.activeId, overlay);
  window.webContents.focus();
  window.webContents.send('shell:intent', value);
}

function publish(): void {
  if (!accounts || !store || !window || window.isDestroyed()) return;
  accounts.layout(store.value.activeId, overlay);
  const state = snapshot();
  window.webContents.send('shell:state', state);
  const active = state.accounts.find(account => account.id === state.activeId);
  window.setTitle(active ? `${active.name} — Switchboard` : 'Switchboard');
  const count = state.accounts.reduce((sum, account) => sum + account.unread, 0);
  app.dock?.setBadge(count ? (count > 99 ? '99+' : String(count)) : '');
  const busy = state.accounts.some(account => account.inCall);
  if (busy && sleepBlocker === null) sleepBlocker = powerSaveBlocker.start('prevent-app-suspension');
  else if (!busy && sleepBlocker !== null) { powerSaveBlocker.stop(sleepBlocker); sleepBlocker = null; }
  refreshMenus();
}

function refreshMenus(): void {
  const workspaceItems: MenuItemConstructorOptions[] = store.value.accounts.map((account, index) => ({
    label: account.name, type: 'radio', checked: account.id === store.value.activeId,
    accelerator: index < 9 ? `CommandOrControl+${index + 1}` : undefined,
    click: () => select(account.id)
  }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Switchboard', submenu: [
      { role: 'about' }, { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => intent('settings') },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
    ] },
    { label: 'Workspace', submenu: [
      { label: 'Add workspace…', accelerator: 'CommandOrControl+N', click: () => intent('add') },
      { type: 'separator' }, ...workspaceItems,
      { type: 'separator' }, { label: 'Reload workspace', accelerator: 'CommandOrControl+R', enabled: !!store.value.activeId, click: () => { if (store.value.activeId) void accounts.reload(store.value.activeId); } }
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Show Switchboard', click: show }, { role: 'togglefullscreen' },
      ...(!app.isPackaged ? [{ label: 'Inspect workspace', accelerator: 'CommandOrControl+Alt+I', click: () => { const id = store.value.activeId; if (id) accounts.entries.get(id)?.view.webContents.openDevTools({ mode: 'detach' }); } }] : [])
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'Project and documentation', click: () => { void shell.openExternal('https://github.com/ozeitis/quo-switchboard'); } },
      { label: 'Download updates…', click: () => { void shell.openExternal(releasesURL); } }
    ] }
  ]));
  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show Switchboard', click: show }, { type: 'separator' },
      ...store.value.accounts.map(account => ({ label: `${account.name}${accounts.entries.get(account.id)?.state.ringing ? ' — Incoming call' : ''}`, click: () => select(account.id) })),
      { type: 'separator' }, { label: 'Add workspace…', click: () => intent('add') }, { role: 'quit' }
    ]));
  }
}

function assertShell(event: IpcMainInvokeEvent): void {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== shellURL) throw new Error('Untrusted sender');
}

async function command(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') throw new Error('Invalid command');
  const cmd = value as ShellCommand;
  switch (cmd.type) {
    case 'add': {
      if (!validName(cmd.name) || !validColor(cmd.color)) throw new Error('Enter a name of 1–48 characters.');
      if (store.value.accounts.length >= 12) throw new Error('This release supports up to 12 workspaces.');
      const account = { id: randomUUID(), name: cmd.name.trim(), color: cmd.color };
      store.save({ ...store.value, accounts: [...store.value.accounts, account], activeId: account.id });
      accounts.create(account);
      overlay = false;
      break;
    }
    case 'select': if (validId(cmd.id)) select(cmd.id, false); break;
    case 'reload': if (validId(cmd.id)) await accounts.reload(cmd.id); break;
    case 'rename': {
      if (!validId(cmd.id) || !validName(cmd.name) || !validColor(cmd.color)) throw new Error('Invalid workspace details.');
      const entry = accounts.entries.get(cmd.id);
      if (!entry) throw new Error('Workspace no longer exists.');
      store.save({ ...store.value, accounts: store.value.accounts.map(account => account.id === cmd.id ? { ...account, name: cmd.name.trim(), color: cmd.color } : account) });
      entry.state.name = cmd.name.trim();
      entry.state.color = cmd.color;
      break;
    }
    case 'remove': {
      const entry = accounts.entries.get(cmd.id);
      if (!entry) return;
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', message: `Remove ${entry.state.name}?`,
        detail: 'This clears its local sign-in and website data and interrupts any call in this workspace. Your Quo organization and messages remain on Quo.',
        buttons: ['Cancel', 'Remove workspace'], defaultId: 0, cancelId: 0
      });
      if (response !== 1) return;
      await accounts.remove(cmd.id);
      const remaining = store.value.accounts.filter(account => account.id !== cmd.id);
      store.save({ ...store.value, accounts: remaining, activeId: store.value.activeId === cmd.id ? remaining[0]?.id ?? null : store.value.activeId });
      break;
    }
    case 'preferences': {
      if (!validPreferences(cmd.preferences)) throw new Error('Invalid preferences.');
      if (app.isPackaged && cmd.preferences.launchAtLogin !== store.value.preferences.launchAtLogin) app.setLoginItemSettings({ openAtLogin: cmd.preferences.launchAtLogin });
      store.save({ ...store.value, preferences: cmd.preferences });
      if (!cmd.preferences.notifications) notifications.closeAll();
      break;
    }
    case 'overlay': if (typeof cmd.open === 'boolean') overlay = cmd.open; break;
    case 'test-notification': {
      const entry = accounts.entries.get(cmd.id);
      if (entry) { notificationError = false; notifications.test(entry); }
      break;
    }
    case 'open-help': await shell.openExternal('https://github.com/ozeitis/quo-switchboard'); break;
    default: throw new Error('Unknown command');
  }
  publish();
}

if (gotLock) void app.whenReady().then(async () => {
  try { store = new Store(app.getPath('userData')); }
  catch {
    dialog.showErrorBox('Switchboard could not read its settings', 'Your data was preserved. Inspect workspaces.json in ~/Library/Application Support/Switchboard before restarting.');
    app.quit();
    return;
  }
  window = new BrowserWindow({
    width: 1200, height: 800, minWidth: 860, minHeight: 580, title: 'Switchboard',
    titleBarStyle: 'hiddenInset', backgroundColor: '#f5f5f7', show: false,
    webPreferences: { preload: join(__dirname, 'shell-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false }
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  accounts = new Accounts(window, publish, id => notifications?.reset(id));
  notifications = new Notifications(window, accounts, () => store.value.preferences, select, () => { notificationError = true; publish(); });

  ipcMain.handle('shell:snapshot', event => { assertShell(event); return snapshot(); });
  let commands = Promise.resolve();
  ipcMain.handle('shell:command', (event, value: unknown) => {
    assertShell(event);
    const result = commands.then(() => command(value));
    commands = result.catch(() => undefined);
    return result;
  });
  ipcMain.on('account:event', (event, raw: unknown) => {
    const entry = [...accounts.entries.values()].find(item => item.view.webContents === event.sender);
    if (!entry || event.senderFrame !== event.sender.mainFrame || !appOrigin(event.senderFrame.url) || !raw || typeof raw !== 'object') return;
    const data = raw as Record<string, unknown>;
    const accountId = entry.state.id;
    switch (data.type) {
      case 'state':
        if (!['ready', 'sign-in', 'offline'].includes(String(data.status)) || typeof data.inCall !== 'boolean' || typeof data.unread !== 'number' || !Number.isInteger(data.unread)) return;
        entry.state.status = data.status as 'ready' | 'sign-in' | 'offline';
        entry.state.unread = Math.max(0, Math.min(data.unread, 9999));
        entry.state.inCall = data.inCall;
        publish();
        break;
      case 'notification':
        if (!validId(data.id) || !rate.accept(event.sender.id)) return;
        notifications.forward(entry, data.id, cleanText(data.title, 160), cleanText(data.body, 500), cleanText(data.tag, 120), data.silent === true);
        break;
      case 'notification-close':
        if (validId(data.id)) notifications.closePage(accountId, data.id);
        break;
      case 'ring':
        if (!validId(data.id) || !rate.accept(event.sender.id)) return;
        if (entry.ringId) notifications.close(`${accountId}:ring:${entry.ringId}`);
        entry.ringId = data.id;
        entry.state.ringing = true;
        notifications.ring(entry);
        publish();
        break;
      case 'ring-end':
        if (data.id !== entry.ringId) return;
        notifications.close(`${accountId}:ring:${entry.ringId}`);
        entry.ringId = null;
        entry.state.ringing = false;
        publish();
        break;
      case 'answer-result':
        if (data.id === entry.ringId && data.clicked === false) window.webContents.send('shell:intent', 'answer-unavailable');
        break;
    }
  });

  for (const account of store.value.accounts) accounts.create(account);
  const image = nativeImage.createFromPath(join(__dirname, 'tray.png')).resize({ width: 18, height: 18 });
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Switchboard');
  tray.on('click', show);
  window.on('resize', () => accounts.layout(store.value.activeId, overlay));
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
  powerMonitor.on('resume', () => accounts.resume());
  app.on('activate', show);
  app.on('second-instance', show);
  app.setAboutPanelOptions({ applicationName: 'Switchboard for Quo', applicationVersion: app.getVersion(), copyright: 'Copyright © 2026 Oze', website: 'https://github.com/ozeitis/quo-switchboard' });
  await window.loadFile(join(__dirname, 'renderer/index.html'));
  publish();
  show();
}).catch(() => { dialog.showErrorBox('Switchboard could not start', 'Restart the app. If this continues, report the failure with your macOS and Switchboard versions.'); app.quit(); });

app.on('before-quit', event => {
  if (!accounts || quitting) return;
  const busy = [...accounts.entries.values()].some(entry => entry.state.inCall || entry.state.ringing);
  if (busy) {
    event.preventDefault();
    if (quitPrompt) return;
    quitPrompt = true;
    void dialog.showMessageBox(window, {
      type: 'warning', message: 'Quit while a call is active?', detail: 'Quitting disconnects every workspace and interrupts calls.',
      buttons: ['Cancel', 'Quit'], defaultId: 0, cancelId: 0
    }).then(({ response }) => { quitPrompt = false; if (response === 1) { quitting = true; shutdown(); app.quit(); } });
    return;
  }
  quitting = true;
  shutdown();
});

function shutdown(): void {
  notifications?.closeAll();
  accounts?.close();
  tray?.destroy();
  if (sleepBlocker !== null) powerSaveBlocker.stop(sleepBlocker);
}
