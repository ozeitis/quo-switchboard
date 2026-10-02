import { randomUUID } from 'node:crypto';
import type { LiveAccount } from './accounts';
import type { CallAction } from '../shared/model';

export class Calls {
  private pending = new Map<string, { workspaceId: string; resolve: (clicked: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private entries: Map<string, LiveAccount>, private select: (id: string) => void) {}
  async perform(workspaceId: string, callId: string, action: CallAction): Promise<boolean> {
    const entry = this.entries.get(workspaceId);
    if (!entry || entry.state.callId !== callId || !entry.state.callActions?.includes(action)) return false;
    if (action === 'answer' && [...this.entries.values()].some(account => account.state.inCall)) return false;
    this.select(workspaceId);
    const requestId = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(requestId); resolve(false); }, 3000);
      this.pending.set(requestId, { workspaceId, resolve, timer });
      entry.view.webContents.send('account:call-action', { requestId, callId, action });
    });
  }
  complete(workspaceId: string, requestId: string, clicked: boolean): void {
    const request = this.pending.get(requestId);
    if (!request || request.workspaceId !== workspaceId) return;
    clearTimeout(request.timer); this.pending.delete(requestId); request.resolve(clicked);
  }
  dispose(): void { for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve(false); } this.pending.clear(); }
}
