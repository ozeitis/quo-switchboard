import { dialog, session, shell, systemPreferences, WebContentsView, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { appOrigin, accountNavigation, externalURL } from './policy';
import { partitionFor, type Account, type AccountState } from '../shared/model';

export interface LiveAccount {
  state: AccountState;
  view: WebContentsView;
  ringId: string | null;
}

export class Accounts {
  readonly entries = new Map<string, LiveAccount>();
  private allowedPermissions = new Set(['notifications', 'media', 'speaker-selection', 'fullscreen', 'clipboard-sanitized-write']);
  constructor(private window: BrowserWindow, private changed: () => void, private reset: (id: string) => void) {}

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
    const entry: LiveAccount = { state: { ...account, status: 'loading', unread: 0, ringing: false, inCall: false }, view, ringId: null };
    this.entries.set(account.id, entry);
    this.window.contentView.addChildView(view);
    const contents = view.webContents;

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
      entry.state.status = 'loading';
      this.changed();
    });
    const finishedLoading = () => {
      if (entry.state.status === 'loading') entry.state.status = appOrigin(contents.getURL()) ? 'ready' : 'sign-in';
      this.changed();
    };
    contents.on('did-finish-load', finishedLoading);
    contents.on('did-stop-loading', finishedLoading);
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) this.failed(entry);
    });
    contents.on('render-process-gone', () => { this.reset(account.id); this.failed(entry); });
    void contents.loadURL('https://my.quo.com').catch(() => this.failed(entry));
    return entry;
  }

  private failed(entry: LiveAccount): void {
    entry.state.status = 'error';
    entry.ringId = null;
    entry.state.ringing = false;
    entry.state.inCall = false;
    this.changed();
  }

  private async openExternal(url: string): Promise<void> {
    if (!externalURL(url)) return;
    await shell.openExternal(url).catch(() => undefined);
  }

  layout(activeId: string | null, overlay: boolean): void {
    const [width = 1200, height = 800] = this.window.getContentSize();
    for (const [id, entry] of this.entries) {
      // Keep the renderer alive. Switching workspaces must not recreate a session.
      entry.view.setVisible(id === activeId && !overlay && entry.state.status !== 'error' && entry.state.status !== 'loading');
      entry.view.setBounds({ x: 224, y: 64, width: Math.max(0, width - 224), height: Math.max(0, height - 64) });
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
    entry.view.webContents.reload();
  }

  async remove(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.reset(id);
    const profile = entry.view.webContents.session;
    this.window.contentView.removeChildView(entry.view);
    entry.view.webContents.close();
    this.entries.delete(id);
    await profile.clearStorageData();
    await profile.clearCache();
    await profile.clearAuthCache();
    await profile.closeAllConnections();
  }

  resume(): void {
    // Let Quo repair its transport. Never reload a healthy or active call on wake.
    for (const entry of this.entries.values()) {
      if (entry.state.status === 'error' && !entry.state.inCall && !entry.state.ringing) entry.view.webContents.reload();
    }
  }

  close(): void {
    for (const entry of this.entries.values()) {
      entry.view.webContents.session.flushStorageData();
      entry.view.webContents.close();
    }
    this.entries.clear();
  }
}
