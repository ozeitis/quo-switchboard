import { randomUUID } from 'node:crypto';
import type { LiveAccount } from './accounts';
import { appOrigin } from './policy';
import type { AccountEvent, WebUpdateState } from '../shared/model';

type Result = Extract<AccountEvent, { type: 'web-update-result' }>['result'];
const RESULTS: Result[] = ['ready', 'current', 'applied', 'busy', 'unsupported', 'error', 'stale'];
export const validUpdateResult = (value: unknown): value is Result => RESULTS.includes(value as Result);

export class WebUpdates {
  private phase: WebUpdateState['phase'] = 'idle';
  private error?: string;
  private requests = new Map<string, { workspaceId: string; finish: (result: Result) => void; timer: ReturnType<typeof setTimeout> }>();
  private reloads?: { versions: Map<string, number>; finish: (done: boolean) => void; timer: ReturnType<typeof setTimeout> };
  constructor(private entries: Map<string, LiveAccount>, private changed: () => void) {}
  private busy(): boolean {
    return [...this.entries.values()].some(({ state }) => state.inCall || state.ringing || state.audio?.capturing || state.audio?.testing);
  }
  state(): WebUpdateState {
    const pending = [...this.entries.values()].filter(entry => entry.state.webUpdateId);
    return { count: pending.length, phase: this.phase,
      blocked: this.busy() || [...this.entries.values()].some(entry => ['loading', 'offline', 'error'].includes(entry.state.status)), error: this.error };
  }
  complete(workspaceId: string, requestId: string, result: Result): void {
    const request = this.requests.get(requestId);
    if (!request || request.workspaceId !== workspaceId) return;
    clearTimeout(request.timer); this.requests.delete(requestId); request.finish(result);
  }
  private request(entry: LiveAccount, operation: 'check' | 'apply'): Promise<Result> {
    if (entry.view.webContents.isDestroyed() || !appOrigin(entry.view.webContents.getURL()) || entry.state.status !== 'ready') return Promise.resolve('error');
    const requestId = randomUUID();
    return new Promise(finish => {
      const timer = setTimeout(() => { this.requests.delete(requestId); finish('error'); }, 35_000);
      this.requests.set(requestId, { workspaceId: entry.state.id, finish, timer });
      entry.view.webContents.send('account:web-update', { requestId, operation, updateId: entry.state.webUpdateId });
    });
  }
  observe(): void {
    if (!this.reloads) return;
    const done = [...this.reloads.versions].every(([id, version]) => {
      const entry = this.entries.get(id);
      return !!entry && entry.navigationVersion > version && entry.state.status === 'ready' && !entry.state.webUpdateId;
    });
    if (done) { const waiting = this.reloads; this.reloads = undefined; clearTimeout(waiting.timer); waiting.finish(true); }
  }
  private reloaded(versions: Map<string, number>): Promise<boolean> {
    return new Promise(finish => {
      const timer = setTimeout(() => { this.reloads = undefined; finish(false); }, 30_000);
      this.reloads = { versions, finish, timer }; this.observe();
    });
  }
  async apply(): Promise<void> {
    if (this.phase !== 'idle') return;
    if (this.state().blocked) throw new Error('Finish calls and reconnect offline workspaces before updating.');
    const targets = [...this.entries.values()].filter(entry => entry.state.status === 'ready' && appOrigin(entry.view.webContents.getURL()));
    if (!targets.length) return;
    this.error = undefined; this.phase = 'checking'; this.changed();
    try {
      const checks = await Promise.all(targets.map(async entry => ({ entry, result: await this.request(entry, 'check') })));
      const failures = checks.filter(check => !['ready', 'current'].includes(check.result));
      if (failures.length) { this.error = 'Could not check every workspace. Try again.'; return; }
      if (this.state().blocked) { this.error = 'Update paused. Finish calls or reconnect, then try again.'; return; }
      const ready = checks.filter(check => check.result === 'ready' && check.entry.state.webUpdateId);
      if (!ready.length) return;
      this.phase = 'applying'; this.changed();
      const versions = new Map(ready.map(({ entry }) => [entry.state.id, entry.navigationVersion]));
      const results = await Promise.all(ready.map(({ entry }) => this.busy() ? Promise.resolve<Result>('busy') : this.request(entry, 'apply')));
      const accepted = new Map([...versions].filter((_version, index) => results[index] === 'applied'));
      const finished = !accepted.size || await this.reloaded(accepted);
      if (!finished || results.some(result => result !== 'applied')) this.error = 'Some workspaces could not update. Try again when calls finish.';
    } finally { this.phase = 'idle'; this.changed(); }
  }
  dispose(): void {
    for (const request of this.requests.values()) { clearTimeout(request.timer); request.finish('error'); }
    this.requests.clear();
    if (this.reloads) { clearTimeout(this.reloads.timer); this.reloads.finish(false); this.reloads = undefined; }
  }
}
