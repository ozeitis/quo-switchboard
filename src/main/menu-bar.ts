import { Menu, Tray, nativeImage, nativeTheme, type NativeImage, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import type { AccountState, ShellCommand, Snapshot } from '../shared/model';

const status = { loading: 'Opening…', ready: 'Workspace loaded', 'sign-in': 'Sign-in required', offline: 'Offline · counts may be stale', error: 'Could not load' };
const trayIdentity = 'a5a6d2e4-9f37-48c1-a918-2350d4d198be';

export class MenuBar {
  private tray?: Tray;
  private state?: Snapshot;
  private menuKey = '';
  private iconState = '';
  private avatars = new Map<string, NativeImage>();
  private images = process.platform === 'darwin' ? require(join(__dirname, 'native/shell.node')) as { image(options: string): Buffer } : undefined;
  private appearance = () => { this.avatars.clear(); this.menuKey = ''; this.iconState = ''; if (this.state) this.update(this.state); };

  constructor(private select: (id: string) => void, private show: () => void, private command: (command: ShellCommand) => void) {
    nativeTheme.on('updated', this.appearance);
  }

  private icon(options: object, template = false): NativeImage {
    const image = this.images ? nativeImage.createFromBuffer(this.images.image(JSON.stringify(options)), { scaleFactor: 2 }) : nativeImage.createFromPath(join(__dirname, 'tray.png'));
    image.setTemplateImage(template);
    return image;
  }

  update(state: Snapshot): void {
    this.state = state;
    if (!state.preferences.showMenuBar) { this.tray?.destroy(); this.tray = undefined; this.menuKey = ''; this.iconState = ''; return; }
    const iconState = state.accounts.some(account => account.ringing) ? 'ringing' : state.accounts.some(account => account.inCall) ? 'call' : 'idle';
    if (!this.tray) this.tray = new Tray(this.icon({ state: iconState }, true), trayIdentity);
    if (this.iconState !== iconState) { this.tray.setImage(this.icon({ state: iconState }, true)); this.iconState = iconState; }
    const total = state.accounts.reduce((sum, account) => sum + account.unread, 0);
    const partial = state.accounts.some(account => !account.unreadKnown);
    const count = `${total}${partial ? '+' : ''}`;
    const compactCount = total > 99 ? '99+' : count;
    if (process.platform === 'darwin') this.tray.setTitle(state.preferences.menuBarCount && total ? compactCount : '', { fontType: 'monospacedDigit' });
    this.tray.setToolTip(['Switchboard', ...state.accounts.map(account => `${account.name}: ${this.detail(account)}`)].join('\n'));
    const key = JSON.stringify([state.accounts, state.activeId, state.preferences, state.notificationError]);
    if (key === this.menuKey) return;
    this.menuKey = key;
    // Keep the cache bounded to the current account names and colors.
    const keys = new Set(state.accounts.map(account => JSON.stringify([account.name, account.color])));
    for (const key of this.avatars.keys()) if (!keys.has(key)) this.avatars.delete(key);
    const stale = state.accounts.some(account => account.status === 'offline' || account.status === 'error');
    const summary = !state.accounts.length ? 'No workspaces yet' : total ? `${count} unread` : partial ? 'Unread counts unavailable' : stale ? 'Counts may be stale' : 'All caught up';
    const rows: MenuItemConstructorOptions[] = [...state.accounts]
      .sort((a, b) => Number(b.ringing) - Number(a.ringing) || Number(b.inCall) - Number(a.inCall))
      .map(account => {
        const key = JSON.stringify([account.name, account.color]);
        if (!this.avatars.has(key)) this.avatars.set(key, this.icon({ type: 'avatar', name: account.name, color: account.color }));
        const calling = account.ringing ? 'Incoming call' : account.inCall ? 'On a call' : '';
        const unread = account.unread ? `${account.unread}${account.unreadKnown ? '' : '+'} unread` : '';
        const sublabel = calling ? this.detail(account) : account.status !== 'ready' ? status[account.status]
          : !account.unreadKnown ? 'Unread unavailable' : account.unread ? undefined : 'No unread activity';
        return { id: `workspace:${account.id}`, label: `${account.name}${calling || unread ? ` — ${calling || unread}` : ''}`, sublabel,
          type: 'radio', checked: account.id === state.activeId, icon: this.avatars.get(key), click: () => this.select(account.id) };
      });
    const active = state.accounts.find(account => account.id === state.activeId);
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { id: 'summary', label: summary, sublabel: `${state.accounts.length} ${state.accounts.length === 1 ? 'workspace' : 'workspaces'}`, enabled: false },
      { type: 'separator' }, ...rows,
      ...(rows.length ? [{ type: 'separator' as const }] : []),
      { label: 'Show Switchboard', click: this.show },
      { label: 'New workspace…', enabled: state.accounts.length < 12, click: () => this.command({ type: 'new-workspace' }) },
      { type: 'separator' },
      { id: 'alerts', label: state.notificationError ? 'Desktop alert failed' : `Desktop alerts: ${state.preferences.notifications ? 'On' : 'Off'}`,
        sublabel: state.notificationError ? 'Check macOS notification settings' : 'macOS also controls delivery', enabled: false },
      { id: 'test-notification', label: 'Test notification', enabled: !!active && state.preferences.notifications, click: () => { if (active) this.command({ type: 'test-notification', id: active.id }); } },
      { label: 'Notification settings…', click: () => this.command({ type: 'settings' }) },
      { label: 'Connection health…', click: () => this.command({ type: 'health' }) },
      { type: 'separator' }, { role: 'quit' }
    ]));
  }

  private detail(account: AccountState): string {
    const unread = account.unreadKnown ? account.unread ? `${account.unread} unread` : 'No unread activity' : account.unread ? `At least ${account.unread} unread` : 'Unread unavailable';
    return `${account.ringing ? 'Open to answer in Quo' : account.inCall ? 'Manage call in Quo' : status[account.status]} · ${unread}`;
  }

  dispose(): void { nativeTheme.removeListener('updated', this.appearance); this.tray?.destroy(); this.tray = undefined; }
}
