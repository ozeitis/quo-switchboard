import { nativeTheme } from 'electron';
import { join } from 'node:path';
import type { AccountState, ShellCommand, Snapshot } from '../shared/model';

const status = { loading: 'Opening…', ready: 'Workspace loaded', 'sign-in': 'Sign-in required', offline: 'Offline · counts may be stale', error: 'Could not load' };
const phases = { idle: '', ringing: 'Incoming call', dialing: 'Dialing…', connecting: 'Connecting…', active: 'On a call', held: 'On hold', reconnecting: 'Reconnecting…', transferring: 'Transferring…', ending: 'Ending call…' };
interface StatusBridge {
  statusAttach(callback: (json: string) => void): void;
  statusUpdate(json: string): void;
  statusFrame(frame: number): void;
  statusShow(): void;
  statusDispose(): void;
}
export function callDescription(account: AccountState): string {
  const ongoing = account.inCall ? `${phases[account.callPhase] || 'On a call'}${account.muted ? ' · Muted' : ''}` : '';
  return account.ringing ? ongoing ? `Call waiting · ${ongoing}` : 'Incoming call' : ongoing;
}
function detail(account: AccountState): string {
  const unread = account.unreadKnown ? account.unread ? `${account.unread} unread` : 'No unread activity'
    : account.unread ? `At least ${account.unread} unread` : 'Unread unavailable';
  return `${callDescription(account) || status[account.status]} · ${unread}`;
}
function card(account: AccountState) {
  const { id, name, color, themeAccent, status, unread, unreadKnown, ringing, inCall, callPhase, muted, callId, callActions } = account;
  return { id, name, color, themeAccent, status, unread, unreadKnown, ringing, inCall, callPhase, muted, callId, callActions,
    detail: detail(account), callDescription: callDescription(account) };
}

export class MenuBar {
  private bridge?: StatusBridge;
  private state?: Snapshot;
  private frame = 0;
  private animation?: ReturnType<typeof setInterval>;
  private appearance = () => { if (this.state) this.update(this.state); };
  constructor(command: (command: ShellCommand) => void) {
    if (process.platform === 'darwin') {
      this.bridge = require(join(__dirname, 'native/shell.node')) as StatusBridge;
      this.bridge.statusAttach(json => { try { command(JSON.parse(json) as ShellCommand); } catch { /* Malformed native messages have no authority. */ } });
    }
    nativeTheme.on('updated', this.appearance);
  }
  update(state: Snapshot): void {
    this.state = state;
    const separate = state.preferences.menuBarLayout === 'separate' && state.accounts.length > 0;
    const desired = state.preferences.showMenuBar ? separate ? state.accounts.map(account => account.id) : ['combined'] : [];
    const items = desired.map(id => {
      const source = state.accounts.find(account => account.id === id);
      const scope = source ? [source] : state.accounts;
      const total = scope.reduce((sum, account) => sum + account.unread, 0);
      const partial = scope.some(account => !account.unreadKnown);
      const title = state.preferences.menuBarCount && total ? total > 99 ? '99+' : `${total}${partial ? '+' : ''}` : '';
      return { id, name: source?.name ?? 'Switchboard', title, tooltip: scope.map(account => `${account.name}: ${detail(account)}`).join('\n'), source: source ? card(source) : undefined };
    });
    this.bridge?.statusUpdate(JSON.stringify({
      items, accounts: state.accounts.map(card), activeId: state.activeId,
      activity: state.activity ?? [], testCall: state.testCall,
      reduceMotion: state.appearance?.reduceMotion || !state.preferences.animateActivity
    }));
    const animate = desired.length > 0 && state.preferences.animateActivity && !state.appearance?.reduceMotion
      && (state.accounts.some(account => account.ringing) || state.testCall?.phase === 'ringing');
    if (animate && !this.animation) {
      this.animation = setInterval(() => { this.frame ^= 1; this.bridge?.statusFrame(this.frame); }, 650);
      this.animation.unref();
    } else if (!animate) { clearInterval(this.animation); this.animation = undefined; this.frame = 0; }
    this.bridge?.statusFrame(this.frame);
  }
  open(): void { this.bridge?.statusShow(); }
  dispose(): void {
    nativeTheme.removeListener('updated', this.appearance);
    clearInterval(this.animation); this.animation = undefined; this.bridge?.statusDispose();
  }
}
