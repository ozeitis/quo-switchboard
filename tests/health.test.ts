import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Health, RecoveryBudget } from '../src/main/health';

test('recovery stops a crash loop and allows retry after the cooling period', () => {
  let now = 0;
  const budget = new RecoveryBudget(() => now);
  assert.deepEqual(Array.from({ length: 6 }, () => budget.nextDelay()), [2000, 5000, 15000, 30000, 60000, null]);
  now = 15 * 60_000;
  assert.equal(budget.nextDelay(), 2000);
});

test('health distinguishes awake gaps from sleep and saves private bounded diagnostics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'switchboard-health-'));
  let now = 0;
  try {
    const health = new Health(directory, () => now);
    health.heartbeat('workspace-a');
    now = 10_000;
    health.heartbeat('workspace-a');
    assert.equal(health.pulse('workspace-a').largestGap, 10_000);
    health.suspend();
    now += 48 * 60 * 60_000;
    health.resume();
    health.heartbeat('workspace-a');
    assert.equal(health.pulse('workspace-a').largestGap, 10_000);
    now += 120_000;
    health.tick();
    const data = JSON.parse(readFileSync(join(directory, 'health.json'), 'utf8'));
    assert.deepEqual(data.events.map((event: { kind: string }) => event.kind), ['started', 'sleep', 'wake', 'sampling-gap']);
    assert.equal(statSync(join(directory, 'health.json')).mode & 0o777, 0o600);
    for (let i = 0; i < 300; i++) health.record('recovery', 'workspace-a');
    health.close();
    const final = JSON.parse(readFileSync(join(directory, 'health.json'), 'utf8'));
    assert.equal(final.events.length, 200);
    assert.equal(final.stopped, true);
    health.forget('workspace-a');
    assert.equal(health.pulse('workspace-a').count, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
