import { dialog, session, shell, systemPreferences, WebContentsView, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { appOrigin, accountNavigation, externalURL } from './policy';
import { partitionFor, type Account, type AccountState } from '../shared/model';
import { Health, RecoveryBudget } from './health';
import type { AppearanceOptions } from '../shared/theme';
import { installTextMenu } from './text-menu';

export interface LiveAccount {
  state: AccountState;
  view: WebContentsView;
  ringId: string | null;
  recovery: RecoveryBudget;
  retry?: ReturnType<typeof setTimeout>;
}

export class Accounts {
  readonly entries = new Map<string, LiveAccount>();
  private allowedPermissions = new Set(['notifications', 'media', 'speaker-selection', 'fullscreen', 'clipboard-sanitized-write']);
  private closing = false;
  constructor(private window: BrowserWindow, private changed: () => void, private reset: (id: string) => void, private health: Health, private appearance: (id: string) => AppearanceOptions) {}

  create(account: Account): LiveAccount {
    const profile = session.fromPartition(partitionFor(account.id));
    profile.setPermissionCheckHandler((contents, permission, origin, details) => {
      return !!contents && appOrigin(contents.getURL()) && appOrigin(origin) && this.allowedPermissions.has(permission)
        && (permission !== 'media' || details.mediaType !== 'video');
    });
    profile.setPermissionRequestHandler((contents, permission, callback, details) => {
      const allowed = appOrigin(contents.getURL()) && appOrigin(details.requestingUrl) && this.allowedPermissions.has(permission);
      const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : [];
      if (!allowed || (permission === 'media' && (!mediaTypes?.length || mediaTypes.some(type => type !== 'audio')))) { callback(false); return; }
      if (permission === 'media' && process.platform === 'darwin') {
        void systemPreferences.askForMediaAccess('microphone').then(callback, () => callback(false));
      } else callback(true);
    });
    profile.setDevicePermissionHandler(() => false);

    const view = new WebContentsView({ webPreferences: {
      session: profile, preload: join(__dirname, 'account-preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      backgroundThrottling: false, spellcheck: true, autoplayPolicy: 'no-user-gesture-required'
    } });
    view.setBackgroundColor('#ffffff');
    const entry: LiveAccount = { state: { ...account, status: 'loading', unread: 0, unreadKnown: false, ringing: false, inCall: false, callPhase: 'idle', muted: false, themeSupport: 'unmodified' }, view, ringId: null, recovery: new RecoveryBudget() };
    this.entries.set(account.id, entry);
    this.window.contentView.addChildView(view);
    const contents = view.webContents;
    contents.setZoomMode('isolated');
    installTextMenu(contents, this.window);

    const guardNavigation = (event: Electron.Event, url: string) => {
      if (!accountNavigation(url)) { event.preventDefault(); void this.openExternal(url); }
    };
    contents.on('will-navigate', guardNavigation);
    contents.on('will-redirect', (event, url, _inPlace, isMainFrame) => { if (isMainFrame) guardNavigation(event, url); });
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (accountNavigation(url)) void contents.loadURL(url).catch(() => this.failed(entry));
      else void this.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
      // External links are canceled by the navigation guard; the current page stays alive.
      if (!isMainFrame || isInPlace || !accountNavigation(url)) return;
      this.reset(account.id);
      entry.ringId = null;
      entry.state.ringing = false;
      entry.state.inCall = false;
      entry.state.callPhase = 'idle';
      entry.state.muted = false;
      entry.state.themeSupport = 'waiting';
      entry.state.status = 'loading';
      this.changed();
    });
    const finishedLoading = () => {
      if (entry.state.status === 'loading') entry.state.status = appOrigin(contents.getURL()) ? 'ready' : 'sign-in';
      this.applyZoom(entry);
      if (appOrigin(contents.getURL())) this.configureAppearance(entry);
      if (entry.state.status !== 'error') { clearTimeout(entry.retry); entry.retry = undefined; }
      this.changed();
    };
    contents.on('dom-ready', () => this.configureAppearance(entry));
    contents.on('did-finish-load', finishedLoading);
    contents.on('did-stop-loading', finishedLoading);
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) this.failed(entry);
    });
    contents.on('render-process-gone', () => { this.health.record('renderer-crashed', account.id); this.reset(account.id); this.failed(entry); });
    contents.on('unresponsive', () => this.health.record('unresponsive', account.id));
    contents.on('responsive', () => this.health.record('responsive', account.id));
    void contents.loadURL('https://my.quo.com').catch(() => this.failed(entry));
    return entry;
  }

  configureAppearance(entry: LiveAccount): void {
    if (!entry.view.webContents.isDestroyed() && appOrigin(entry.view.webContents.getURL())) entry.view.webContents.send('account:appearance', this.appearance(entry.state.id));
  }

  applyZoom(entry: LiveAccount): void {
    const contents = entry.view.webContents;
    const zoom = appOrigin(contents.getURL()) && entry.state.status !== 'sign-in' ? entry.state.zoom ?? 1 : 1;
    if (contents.getZoomFactor() !== zoom) contents.setZoomFactor(zoom);
  }

  private failed(entry: LiveAccount): void {
    if (this.closing || !this.entries.has(entry.state.id)) return;
    if (entry.state.status !== 'error') this.health.record('load-failed', entry.state.id);
    entry.state.status = 'error';
    entry.ringId = null;
    entry.state.ringing = false;
    entry.state.inCall = false;
    entry.state.callPhase = 'idle';
    entry.state.muted = false;
    entry.state.themeSupport = 'waiting';
    this.changed();
    this.scheduleRecovery(entry);
  }

  private scheduleRecovery(entry: LiveAccount): void {
    if (this.closing || entry.retry || entry.state.inCall || entry.state.ringing) return;
    const delay = entry.recovery.nextDelay();
    if (delay === null) return;
    entry.retry = setTimeout(() => {
      entry.retry = undefined;
      if (this.closing || !this.entries.has(entry.state.id) || entry.view.webContents.isDestroyed()
        || entry.state.status !== 'error' || entry.state.inCall || entry.state.ringing) return;
      this.health.record('recovery', entry.state.id);
      entry.view.webContents.reload();
    }, delay);
    entry.retry.unref();
  }

  private async openExternal(url: string): Promise<void> {
    if (!externalURL(url)) return;
    await shell.openExternal(url).catch(() => undefined);
  }

  layout(activeId: string | null, overlay: boolean, sidebarWidth = 224, toolbarHeight = 64): void {
    const [width = 1200, height = 800] = this.window.getContentSize();
    const pageWidth = Math.max(0, width - sidebarWidth), pageHeight = Math.max(0, height - toolbarHeight);
    for (const [id, entry] of this.entries) {
      // Keep the renderer alive. Switching workspaces must not recreate a session.
      entry.view.setVisible(id === activeId && !overlay && entry.state.status !== 'error' && entry.state.status !== 'loading');
      entry.view.setBounds({ x: sidebarWidth, y: toolbarHeight, width: pageWidth, height: pageHeight });
    }
  }

  async reload(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.state.inCall || entry.state.ringing) {
      const { response } = await dialog.showMessageBox(this.window, {
        type: 'warning', message: 'Reload this workspace?', detail: 'Reloading will interrupt its current or incoming call.',
        buttons: ['Cancel', 'Reload'], defaultId: 0, cancelId: 0
      });
      if (response !== 1) return;
    }
    clearTimeout(entry.retry);
    entry.retry = undefined;
    entry.view.webContents.reload();
  }

  async remove(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.reset(id);
    clearTimeout(entry.retry);
    const profile = entry.view.webContents.session;
    this.window.contentView.removeChildView(entry.view);
    entry.view.webContents.close();
    this.entries.delete(id);
    try {
      await profile.clearStorageData();
      await profile.clearCache();
      await profile.clearAuthCache();
      await profile.closeAllConnections();
      this.health.forget(id);
    } catch (error) {
      // Restore a usable view if local cleanup fails; settings still reference it.
      this.create({ id, name: entry.state.name, color: entry.state.color, zoom: entry.state.zoom, theme: entry.state.theme });
      this.health.record('storage-error', id);
      this.changed();
      throw error;
    }
  }

  resume(): void {
    // Let Quo repair its transport. Never reload a healthy or active call on wake.
    for (const entry of this.entries.values()) {
      if (entry.state.status === 'error') this.scheduleRecovery(entry);
      else if (!entry.view.webContents.isDestroyed() && appOrigin(entry.view.webContents.getURL())) entry.view.webContents.send('account:probe');
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.all([...this.entries.values()].map(async entry => {
      clearTimeout(entry.retry);
      try {
        entry.view.webContents.session.flushStorageData();
        await entry.view.webContents.session.cookies.flushStore();
      } catch { this.health.record('storage-error', entry.state.id); }
    }));
    for (const entry of this.entries.values()) {
      entry.view.webContents.close();
    }
    this.entries.clear();
  }
}
