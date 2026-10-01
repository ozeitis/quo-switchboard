import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type EventKind = 'started' | 'sleep' | 'wake' | 'sampling-gap' | 'load-failed' | 'renderer-crashed' | 'unresponsive' | 'responsive' | 'recovery' | 'sign-in' | 'offline' | 'ready' | 'storage-error' | 'removed' | 'stopped';
interface HealthEvent { at: number; kind: EventKind; workspace?: string }
interface Pulse { at: number; count: number; largestGap: number }

/** Local page-liveness evidence. It deliberately makes no claim about Quo's transport. */
export class Health {
  readonly started: number;
  private events: HealthEvent[] = [];
  private pulses = new Map<string, Pulse>();
  private lastTick: number;
  private sleeping = false;
  private resumeAt = 0;
  private stopped = false;
  writeError = false;
  constructor(private directory: string, private clock = Date.now) {
    this.started = this.lastTick = clock();
    this.record('started');
  }
  record(kind: EventKind, workspace?: string): void {
    this.events.push({ at: this.clock(), kind, ...(workspace ? { workspace } : {}) });
    if (this.events.length > 200) this.events.shift();
  }
  heartbeat(id: string): void {
    const now = this.clock();
    const previous = this.pulses.get(id);
    const gap = previous && previous.at >= this.resumeAt ? now - previous.at : 0;
    this.pulses.set(id, { at: now, count: (previous?.count ?? 0) + 1, largestGap: Math.max(previous?.largestGap ?? 0, gap) });
  }
  pulse(id: string): { age: number | null; count: number; largestGap: number } {
    const pulse = this.pulses.get(id);
    return { age: pulse ? Math.max(0, this.clock() - pulse.at) : null, count: pulse?.count ?? 0, largestGap: pulse?.largestGap ?? 0 };
  }
  suspend(): void { this.sleeping = true; this.record('sleep'); this.flush(); }
  resume(): void { this.sleeping = false; this.resumeAt = this.lastTick = this.clock(); this.record('wake'); }
  tick(): void {
    const now = this.clock();
    if (!this.sleeping && now - this.lastTick > 90_000) this.record('sampling-gap');
    this.lastTick = now;
    this.flush();
  }
  report(): object {
    return { version: 1, started: this.started, sampledAt: this.clock(), stopped: this.stopped, sleeping: this.sleeping,
      scope: 'Page liveness only. Does not verify Quo authentication, message delivery, or call connectivity.',
      workspaces: Object.fromEntries(this.pulses), events: this.events };
  }
  forget(id: string): void { this.pulses.delete(id); this.record('removed', id); }
  flush(): void {
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      const file = join(this.directory, 'health.json');
      writeFileSync(`${file}.tmp`, JSON.stringify(this.report(), null, 2) + '\n', { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
      this.writeError = false;
    } catch { this.writeError = true; }
  }
  close(): void { this.stopped = true; this.record('stopped'); this.flush(); }
}

/** Five recovery attempts per fifteen minutes; a crash loop cannot keep reloading. */
export class RecoveryBudget {
  private attempts: number[] = [];
  constructor(private clock = Date.now) {}
  nextDelay(): number | null {
    const now = this.clock();
    this.attempts = this.attempts.filter(time => now - time < 15 * 60_000);
    const delay = [2_000, 5_000, 15_000, 30_000, 60_000][this.attempts.length];
    if (delay === undefined) return null;
    this.attempts.push(now);
    return delay;
  }
}
