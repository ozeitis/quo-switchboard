import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { IncomingCallCard, ShellCommand, Snapshot } from '../shared/model';

interface PanelBridge {
  callsAttach(handle: Buffer, callback: (json: string) => void): void;
  callsUpdate(json: string): void;
  callsComplete(token: string): void;
  callsOwnsAlerts(): boolean;
  callsDispose(): void;
}

export class CallPanel {
  private bridge: PanelBridge;
  private disposePromise?: Promise<void>;
  private disposed?: () => void;
  constructor(window: BrowserWindow, command: (command: ShellCommand) => Promise<void> | void) {
    this.bridge = require(join(__dirname, 'native/shell.node')) as PanelBridge;
    this.bridge.callsAttach(window.getNativeWindowHandle(), json => {
      let value: ShellCommand | { type: 'call-panel-disposed' };
      try { value = JSON.parse(json) as typeof value; } catch { return; }
      if (value.type === 'call-panel-disposed') { this.disposed?.(); return; }
      void Promise.resolve().then(() => command(value)).finally(() => {
        if (value.type === 'call-action' || value.type === 'test-call-action') {
          this.bridge.callsComplete(value.callId);
        }
      }).catch(() => undefined);
    });
  }
  update(state: Snapshot, locked: boolean): void {
    this.bridge.callsUpdate(JSON.stringify({ enabled: state.preferences.notifications && state.preferences.floatingCalls && !locked,
      cards: state.incomingCalls ?? [], unlocked: !locked }));
  }
  ownsAlerts(): boolean { return this.bridge.callsOwnsAlerts(); }
  dispose(): Promise<void> {
    return this.disposePromise ??= new Promise<void>(resolve => { this.disposed = resolve; this.bridge.callsDispose(); });
  }
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
