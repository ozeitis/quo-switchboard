import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerMonitor, powerSaveBlocker, shell, Tray, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Accounts } from './accounts';
import { Notifications } from './notifications';
import { appOrigin, cleanText, RateLimit } from './policy';
import { Store } from './store';
import { NativeShell } from './native-shell';
import { Health } from './health';
import { WindowState } from './window-state';
import { validColor, validId, validName, validPreferences, ZOOM_FACTORS, type ShellCommand, type Snapshot } from '../shared/model';
import { SHELL_LAYOUT } from '../shared/layout';

app.setName('Switchboard');
app.setPath('userData', !app.isPackaged && process.env.SWITCHBOARD_TEST_DATA
  ? process.env.SWITCHBOARD_TEST_DATA : join(app.getPath('appData'), app.isPackaged ? 'Switchboard' : 'Switchboard Development'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let window: BrowserWindow;
let store: Store;
let accounts: Accounts;
let notifications: Notifications;
let tray: Tray;
let nativeShell: NativeShell | undefined;
let health: Health;
let healthTimer: ReturnType<typeof setInterval>;
let shutdownStarted = false;
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
    nativeShell: !!nativeShell,
    sidebarCollapsed: store.value.sidebarCollapsed,
    macAppearance: store.value.macAppearance,
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
  nativeShell?.dismiss();
  window.webContents.send('shell:intent', 'close-overlay');
  publish();
  if (focus) { show(); accounts.entries.get(id)?.view.webContents.focus(); }
}

function intent(value: string): void {
  show();
  if (nativeShell) {
    if (value === 'add') nativeShell.form();
    else if (value === 'settings') nativeShell.settings();
    return;
  }
  overlay = true;
  accounts.layout(store.value.activeId, overlay);
  window.webContents.focus();
  window.webContents.send('shell:intent', value);
}

function publish(): void {
  if (!accounts || !store || !window || window.isDestroyed()) return;
  layoutWorkspaces();
  const state = snapshot();
  nativeShell?.update(state);
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

function layoutWorkspaces(): void {
  const width = nativeShell ? store.value.sidebarCollapsed ? SHELL_LAYOUT.railWidth : SHELL_LAYOUT.sidebarWidth : 224;
  accounts.layout(store.value.activeId, overlay, width, nativeShell ? SHELL_LAYOUT.toolbarHeight : 64);
}

function refreshMenus(): void {
  const active = store.value.activeId ? accounts.entries.get(store.value.activeId) : undefined;
  const zoom = active?.state.zoom ?? 1;
  const canZoom = !!active && ['ready', 'offline'].includes(active.state.status) && appOrigin(active.view.webContents.getURL());
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
      { label: 'New workspace…', accelerator: 'CommandOrControl+N', enabled: store.value.accounts.length < 12, click: () => intent('add') },
      ...(nativeShell ? [{ label: 'Edit workspace…', enabled: !!store.value.activeId, click: () => { if (store.value.activeId) { show(); nativeShell?.form(store.value.activeId); } } }] : []),
      { type: 'separator' }, ...workspaceItems,
      { type: 'separator' }, { label: 'Reload workspace', accelerator: 'CommandOrControl+R', enabled: !!store.value.activeId, click: () => { if (store.value.activeId) void accounts.reload(store.value.activeId); } }
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      ...(nativeShell ? [{ label: store.value.sidebarCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar', accelerator: 'CommandOrControl+Shift+L', click: () => { void command({ type: 'toggle-sidebar' }); } }] : []),
      { label: 'Use Mac Fonts', type: 'checkbox', checked: store.value.macAppearance, click: () => { void command({ type: 'toggle-appearance' }); } },
      { type: 'separator' },
      { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', enabled: canZoom && zoom < 3, click: () => { void command({ type: 'zoom-in' }); } },
      { label: 'Zoom Out', accelerator: 'CommandOrControl+-', enabled: canZoom && zoom > 0.5, click: () => { void command({ type: 'zoom-out' }); } },
      { label: 'Actual Size', accelerator: 'CommandOrControl+0', enabled: canZoom && zoom !== 1, click: () => { void command({ type: 'reset-zoom' }); } },
      { type: 'separator' },
      { label: 'Show Switchboard', click: show }, { role: 'togglefullscreen' },
      ...(!app.isPackaged ? [{ label: 'Inspect workspace', accelerator: 'CommandOrControl+Alt+I', click: () => { const id = store.value.activeId; if (id) accounts.entries.get(id)?.view.webContents.openDevTools({ mode: 'detach' }); } }] : [])
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'Connection health…', click: () => { void command({ type: 'health' }); } },
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
    case 'toggle-sidebar': store.save({ ...store.value, sidebarCollapsed: !store.value.sidebarCollapsed }); break;
    case 'toggle-appearance': {
      store.save({ ...store.value, macAppearance: !store.value.macAppearance });
      for (const entry of accounts.entries.values()) if (appOrigin(entry.view.webContents.getURL())) entry.view.webContents.send('account:appearance', store.value.macAppearance);
      break;
    }
    case 'zoom-in':
    case 'zoom-out':
    case 'reset-zoom': {
      const id = store.value.activeId;
      const entry = id ? accounts.entries.get(id) : undefined;
      if (!entry || !['ready', 'offline'].includes(entry.state.status) || !appOrigin(entry.view.webContents.getURL())) break;
      const current = entry.state.zoom ?? 1;
      const zoom = cmd.type === 'reset-zoom' ? 1 : cmd.type === 'zoom-in'
        ? ZOOM_FACTORS.find(value => value > current) ?? 3
        : [...ZOOM_FACTORS].reverse().find(value => value < current) ?? 0.5;
      store.save({ ...store.value, accounts: store.value.accounts.map(account => account.id === id ? { ...account, zoom } : account) });
      entry.state.zoom = zoom;
      entry.view.webContents.setZoomFactor(zoom);
      break;
    }
    case 'new-workspace': intent('add'); break;
    case 'settings': intent('settings'); break;
    case 'health': {
      health.tick();
      const minutes = Math.floor((Date.now() - health.started) / 60_000);
      const lines = store.value.accounts.map(account => {
        const pulse = health.pulse(account.id);
        const state = accounts.entries.get(account.id)?.state;
        const age = pulse.age === null ? 'No page response yet' : `Last page response ${Math.floor(pulse.age / 1000)} seconds ago`;
        return `${account.name}: ${state?.status ?? 'loading'}\n${age}. ${pulse.count} samples. Longest awake gap: ${Math.round(pulse.largestGap / 1000)} seconds.`;
      });
      await dialog.showMessageBox(window, {
        type: 'info', message: 'Connection health',
        detail: `This run: ${Math.floor(minutes / 60)}h ${minutes % 60}m\n\n${lines.join('\n\n') || 'Create a workspace to begin monitoring.'}\n\nThis verifies that each page responds. It cannot prove that Quo is receiving calls or syncing messages. Confirm those with a real call and message after an extended idle period.\n\n${health.writeError ? 'The local health report could not be saved.' : 'Local report: health.json in the app’s data folder. No credentials, messages, or caller details are recorded.'}`,
        buttons: ['Done'], defaultId: 0
      });
      break;
    }
    case 'workspace-limit': throw new Error('Switchboard supports up to 12 workspaces.');
    case 'move-up':
    case 'move-down': {
      if (!validId(cmd.id)) return;
      const list = [...store.value.accounts];
      const from = list.findIndex(account => account.id === cmd.id);
      const to = from + (cmd.type === 'move-up' ? -1 : 1);
      if (from < 0 || to < 0 || to >= list.length) return;
      [list[from], list[to]] = [list[to]!, list[from]!];
      store.save({ ...store.value, accounts: list });
      break;
    }
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
  const windowState = new WindowState(app.getPath('userData'));
  window = new BrowserWindow({
    width: 1200, height: 800, ...windowState.bounds(), minWidth: 860, minHeight: 580, title: 'Switchboard',
    titleBarStyle: 'hiddenInset', backgroundColor: NativeShell.enabled() ? '#00000000' : '#f5f5f7', show: false,
    ...(NativeShell.enabled() ? { trafficLightPosition: { x: 12, y: (SHELL_LAYOUT.toolbarHeight - 14) / 2 }, vibrancy: 'under-window' as const, visualEffectState: 'followWindow' as const } : {}),
    webPreferences: { preload: join(__dirname, 'shell-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false }
  });
  windowState.attach(window);
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  health = new Health(app.getPath('userData'));
  accounts = new Accounts(window, publish, id => notifications?.reset(id), health, () => store.value.macAppearance);
  notifications = new Notifications(window, accounts, () => store.value.preferences, select, () => { notificationError = true; publish(); });

  ipcMain.handle('shell:snapshot', event => { assertShell(event); return snapshot(); });
  let commands = Promise.resolve();
  const enqueue = (value: unknown): Promise<void> => {
    const result = commands.then(() => command(value));
    commands = result.catch(() => undefined);
    return result;
  };
  ipcMain.handle('shell:command', (event, value: unknown) => {
    assertShell(event);
    return enqueue(value);
  });
  if (NativeShell.enabled()) nativeShell = new NativeShell(window, value => {
    void enqueue(value).catch(error => { void dialog.showMessageBox(window, { type: 'error', message: 'Could not complete that action', detail: error instanceof Error ? error.message : 'Try again.' }); });
  });
  ipcMain.on('account:event', (event, raw: unknown) => {
    const entry = [...accounts.entries.values()].find(item => item.view.webContents === event.sender);
    if (!entry || event.senderFrame !== event.sender.mainFrame || !appOrigin(event.senderFrame.url) || !raw || typeof raw !== 'object') return;
    const data = raw as Record<string, unknown>;
    const accountId = entry.state.id;
    switch (data.type) {
      case 'heartbeat': health.heartbeat(accountId); break;
      case 'state':
        if (!['ready', 'sign-in', 'offline'].includes(String(data.status)) || typeof data.inCall !== 'boolean' || typeof data.unread !== 'number' || !Number.isInteger(data.unread)) return;
        if (entry.state.status !== data.status) health.record(data.status as 'ready' | 'sign-in' | 'offline', accountId);
        entry.state.status = data.status as 'ready' | 'sign-in' | 'offline';
        accounts.applyZoom(entry);
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
  window.on('resize', () => { layoutWorkspaces(); nativeShell?.update(snapshot()); });
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
  powerMonitor.on('suspend', () => health.suspend());
  powerMonitor.on('resume', () => { health.resume(); accounts.resume(); });
  healthTimer = setInterval(() => health.tick(), 30_000);
  healthTimer.unref();
  health.tick();
  app.on('activate', show);
  app.on('second-instance', show);
  app.setAboutPanelOptions({ applicationName: 'Switchboard for Quo', applicationVersion: app.getVersion(), copyright: 'Copyright © 2026 Oze', website: 'https://github.com/ozeitis/quo-switchboard' });
  await window.loadFile(join(__dirname, 'renderer/index.html'));
  publish();
  show();
}).catch(() => { dialog.showErrorBox('Switchboard could not start', 'Restart the app. If this continues, report the failure with your macOS and Switchboard versions.'); app.quit(); });

app.on('before-quit', event => {
  if (!accounts || quitting) return;
  event.preventDefault();
  if (shutdownStarted) return;
  const busy = [...accounts.entries.values()].some(entry => entry.state.inCall || entry.state.ringing);
  if (busy) {
    if (quitPrompt) return;
    quitPrompt = true;
    void dialog.showMessageBox(window, {
      type: 'warning', message: 'Quit while a call is active?', detail: 'Quitting disconnects every workspace and interrupts calls.',
      buttons: ['Cancel', 'Quit'], defaultId: 0, cancelId: 0
    }).then(({ response }) => { quitPrompt = false; if (response === 1) void shutdown(); });
    return;
  }
  void shutdown();
});

async function shutdown(): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  clearInterval(healthTimer);
  nativeShell?.dispose();
  notifications?.closeAll();
  await accounts?.close();
  health?.close();
  tray?.destroy();
  if (sleepBlocker !== null) powerSaveBlocker.stop(sleepBlocker);
  quitting = true;
  app.quit();
}
