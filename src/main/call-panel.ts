import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { IncomingCallCard, ShellCommand, Snapshot } from '../shared/model';
import { SHELL_LAYOUT } from '../shared/layout';

interface PanelBridge {
  callsAttach(handle: Buffer, callback: (json: string) => void): void;
  callsUpdate(json: string): void;
  callsDispose(): void;
}

export class CallPanel {
  private bridge: PanelBridge;
  constructor(private window: BrowserWindow, command: (command: ShellCommand) => void) {
    this.bridge = require(join(__dirname, 'native/shell.node')) as PanelBridge;
    this.bridge.callsAttach(window.getNativeWindowHandle(), json => {
      try { command(JSON.parse(json) as ShellCommand); } catch { /* Native commands still require main-process validation. */ }
    });
  }
  update(state: Snapshot, locked: boolean): void {
    const [width, height] = this.window.getContentSize();
    this.bridge.callsUpdate(JSON.stringify({ enabled: state.preferences.notifications && state.preferences.floatingCalls && !locked,
      cards: state.incomingCalls ?? [], shelfEnabled: !locked, width, height, shelfHeight: state.callShelfHeight ?? 0,
      sidebarWidth: state.sidebarCollapsed ? SHELL_LAYOUT.railWidth : SHELL_LAYOUT.sidebarWidth, toolbarHeight: SHELL_LAYOUT.toolbarHeight,
      rowHeight: SHELL_LAYOUT.callRowHeight }));
  }
  dispose(): void { this.bridge.callsDispose(); }
}

export function incomingCallCards(state: Snapshot, preview: (id: string) => { title: string; body: string } | undefined): IncomingCallCard[] {
  const busy = state.accounts.some(account => account.inCall);
  const cards: IncomingCallCard[] = state.accounts.filter(account => account.ringing && account.callId).map(account => ({
    id: account.id, callId: account.callId!, name: account.name, color: account.color,
    accent: account.themeAccent, actions: account.callActions ?? [], busy,
    ...(state.preferences.privateNotifications ? {} : preview(account.id))
  }));
  if (state.testCall?.phase === 'ringing') {
    const account = state.accounts.find(account => account.id === state.testCall!.workspaceId);
    if (account) cards.push({ id: account.id, callId: state.testCall.id, name: account.name, color: account.color,
      accent: account.themeAccent, actions: ['answer', 'decline'], busy, title: 'Test call · local simulation', body: 'No phone call is placed.', simulation: true });
  }
  return cards;
}
