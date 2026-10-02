import { join } from 'node:path';
import type { CallAction, ShellCommand, Snapshot } from '../shared/model';

interface CallCard {
  id: string; callId: string; name: string; color: string; accent?: string;
  actions: CallAction[]; busy: boolean; title?: string; body?: string; simulation?: boolean;
}

interface PanelBridge {
  callsAttach(callback: (json: string) => void): void;
  callsUpdate(json: string): void;
  callsDispose(): void;
}

export class CallPanel {
  private bridge: PanelBridge;
  constructor(command: (command: ShellCommand) => void) {
    this.bridge = require(join(__dirname, 'native/shell.node')) as PanelBridge;
    this.bridge.callsAttach(json => {
      try { command(JSON.parse(json) as ShellCommand); } catch { /* Native commands still require main-process validation. */ }
    });
  }
  update(state: Snapshot, locked: boolean, preview: (id: string) => { title: string; body: string } | undefined): void {
    const busy = state.accounts.some(account => account.inCall);
    const cards: CallCard[] = state.accounts.filter(account => account.ringing && account.callId).map(account => ({
      id: account.id, callId: account.callId!, name: account.name, color: account.color,
      accent: account.themeAccent, actions: account.callActions ?? [], busy,
      ...(state.preferences.privateNotifications ? {} : preview(account.id))
    }));
    if (state.testCall?.phase === 'ringing') {
      const account = state.accounts.find(account => account.id === state.testCall!.workspaceId);
      if (account) cards.push({ id: account.id, callId: state.testCall.id, name: account.name, color: account.color,
        accent: account.themeAccent, actions: ['answer', 'decline'], busy, title: 'Test call · local simulation', body: 'No phone call is placed.', simulation: true });
    }
    this.bridge.callsUpdate(JSON.stringify({ enabled: state.preferences.notifications && state.preferences.floatingCalls && !locked, cards }));
  }
  dispose(): void { this.bridge.callsDispose(); }
}
