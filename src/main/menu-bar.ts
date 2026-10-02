import { Menu, Tray, nativeImage, nativeTheme, type NativeImage, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import type { AccountState, ShellCommand, Snapshot } from '../shared/model';

const status = { loading: 'Opening…', ready: 'Workspace loaded', 'sign-in': 'Sign-in required', offline: 'Offline · counts may be stale', error: 'Could not load' };
const phases = { idle: '', ringing: 'Incoming call', dialing: 'Dialing…', connecting: 'Connecting…', active: 'On a call', held: 'On hold', reconnecting: 'Reconnecting…', transferring: 'Transferring…', ending: 'Ending call…' };
const trayIdentity = 'a5a6d2e4-9f37-48c1-a918-2350d4d198be';
interface Item { tray: Tray; menuKey: string; iconKey: string }

export function callDescription(account: AccountState): string {
  const ongoing = account.inCall ? `${phases[account.callPhase] || 'On a call'}${account.muted ? ' · Muted' : ''}` : '';
  return account.ringing ? ongoing ? `Call waiting · ${ongoing}` : 'Incoming call' : ongoing;
}

export class MenuBar {
  private items = new Map<string, Item>();
  private state?: Snapshot;
  private frame = 0;
  private animation?: ReturnType<typeof setInterval>;
  private images = new Map<string, NativeImage>();
  private bridge = process.platform === 'darwin' ? require(join(__dirname, 'native/shell.node')) as { image(options: string): Buffer } : undefined;
  private appearance = () => { this.images.clear(); for (const item of this.items.values()) { item.menuKey = ''; item.iconKey = ''; } if (this.state) this.update(this.state); };

  constructor(private select: (id: string) => void, private show: () => void, private command: (command: ShellCommand) => void) {
    nativeTheme.on('updated', this.appearance);
  }
  private icon(options: object, template = false): NativeImage {
    const key = JSON.stringify([options, template]);
    const cached = this.images.get(key); if (cached) return cached;
    const image = this.bridge ? nativeImage.createFromBuffer(this.bridge.image(JSON.stringify(options)), { scaleFactor: 2 }) : nativeImage.createFromPath(join(__dirname, 'tray.png'));
    image.setTemplateImage(template);
    if (this.images.size >= 96) this.images.clear();
    this.images.set(key, image); return image;
  }
  update(state: Snapshot): void {
    this.state = state;
    const separate = state.preferences.menuBarLayout === 'separate' && state.accounts.length > 0;
    const desired = state.preferences.showMenuBar ? separate ? state.accounts.map(account => account.id) : ['combined'] : [];
    for (const [id, item] of this.items) if (!desired.includes(id)) { item.tray.destroy(); this.items.delete(id); }
    for (const id of desired) {
      if (!this.items.has(id)) this.items.set(id, { tray: new Tray(this.icon({ state: 'idle' }, true), id === 'combined' ? trayIdentity : id), menuKey: '', iconKey: '' });
      const item = this.items.get(id)!;
      const source = state.accounts.find(account => account.id === id);
      const accounts = source ? [source] : state.accounts;
      const total = accounts.reduce((sum, account) => sum + account.unread, 0);
      const partial = accounts.some(account => !account.unreadKnown);
      const count = `${total}${partial ? '+' : ''}`;
      if (process.platform === 'darwin') item.tray.setTitle(state.preferences.menuBarCount && total ? total > 99 ? '99+' : count : '', { fontType: 'monospacedDigit' });
      item.tray.setToolTip([source?.name ?? 'Switchboard', ...accounts.map(account => `${account.name}: ${this.detail(account)}`)].join('\n'));
      const key = JSON.stringify([state.accounts, state.activeId, state.preferences, state.notificationError]);
      if (key !== item.menuKey) { item.menuKey = key; item.tray.setContextMenu(this.menu(state, source)); }
    }
    const animate = desired.length > 0 && state.preferences.animateActivity && !state.appearance?.reduceMotion && state.accounts.some(account => account.ringing);
    if (animate && !this.animation) { this.animation = setInterval(() => { this.frame ^= 1; this.draw(); }, 650); this.animation.unref(); }
    else if (!animate) { clearInterval(this.animation); this.animation = undefined; this.frame = 0; }
    this.draw();
  }
  private draw(): void {
    if (!this.state) return;
    for (const [id, item] of this.items) {
      const source = this.state.accounts.find(account => account.id === id);
      const account = source ?? this.state.accounts.find(account => account.ringing) ?? this.state.accounts.find(account => account.inCall);
      const phase = account?.ringing ? 'ringing' : account?.inCall ? account.callPhase : 'idle';
      const options = { ...(source ? { type: 'avatar', name: source.name, color: source.color, accent: source.themeAccent } : {}), state: phase, frame: phase === 'ringing' ? this.frame : 0 };
      const key = JSON.stringify(options);
      if (key !== item.iconKey) { item.iconKey = key; item.tray.setImage(this.icon(options, !source && phase === 'idle')); }
    }
  }
  private row(account: AccountState, state: Snapshot): MenuItemConstructorOptions {
    const calling = callDescription(account);
    const unread = account.unread ? `${account.unread}${account.unreadKnown ? '' : '+'} unread` : '';
    return { id: `workspace:${account.id}`, label: `${account.name}${calling || unread ? ` — ${calling || unread}` : ''}`,
      sublabel: calling ? this.detail(account) : account.status !== 'ready' ? status[account.status] : !account.unreadKnown ? 'Unread unavailable' : account.unread ? undefined : 'No unread activity',
      type: 'radio', checked: account.id === state.activeId,
      icon: this.icon({ type: 'avatar', name: account.name, color: account.color, accent: account.themeAccent, state: account.ringing ? 'ringing' : account.inCall ? account.callPhase : 'idle' }), click: () => this.select(account.id) };
  }
  private menu(state: Snapshot, source?: AccountState): Menu {
    const scope = source ? [source] : state.accounts;
    const total = scope.reduce((sum, account) => sum + account.unread, 0);
    const partial = scope.some(account => !account.unreadKnown);
    const summary = !scope.length ? 'No workspaces yet' : total ? `${total}${partial ? '+' : ''} unread` : partial ? 'Unread counts unavailable' : scope.some(account => account.status !== 'ready') ? 'Counts may be stale' : 'All caught up';
    const rows = [...scope].sort((a, b) => Number(b.ringing) - Number(a.ringing) || Number(b.inCall) - Number(a.inCall)).map(account => this.row(account, state));
    const target = source ?? state.accounts.find(account => account.id === state.activeId);
    return Menu.buildFromTemplate([
      { id: 'summary', label: summary, sublabel: source?.name ?? `${state.accounts.length} ${state.accounts.length === 1 ? 'workspace' : 'workspaces'}`, enabled: false },
      { type: 'separator' }, ...rows,
      ...(source && state.accounts.length > 1 ? [{ label: 'Switch workspace', submenu: state.accounts.map(account => this.row(account, state)) }] : []),
      ...(rows.length ? [{ type: 'separator' as const }] : []),
      { label: 'Show Switchboard', click: source ? () => this.select(source.id) : this.show },
      { label: 'Workspace theme…', enabled: !!target, click: () => { if (target) this.command({ type: 'workspace-theme', id: target.id }); } },
      { label: 'New workspace…', enabled: state.accounts.length < 12, click: () => this.command({ type: 'new-workspace' }) },
      { type: 'separator' },
      { id: 'alerts', label: state.notificationError ? 'Desktop alert failed' : `Desktop alerts: ${state.preferences.notifications ? 'On' : 'Off'}`, sublabel: 'macOS also controls delivery', enabled: false },
      { id: 'test-notification', label: 'Test notification', enabled: !!target && state.preferences.notifications, click: () => { if (target) this.command({ type: 'test-notification', id: target.id }); } },
      { label: 'Settings…', click: () => this.command({ type: 'settings' }) },
      { label: 'Connection health…', click: () => this.command({ type: 'health' }) },
      { type: 'separator' }, { role: 'quit' }
    ]);
  }
  private detail(account: AccountState): string {
    const unread = account.unreadKnown ? account.unread ? `${account.unread} unread` : 'No unread activity' : account.unread ? `At least ${account.unread} unread` : 'Unread unavailable';
    return `${callDescription(account) || status[account.status]} · ${unread}`;
  }
  dispose(): void {
    nativeTheme.removeListener('updated', this.appearance); clearInterval(this.animation); this.animation = undefined;
    for (const item of this.items.values()) item.tray.destroy(); this.items.clear(); this.images.clear();
  }
}
