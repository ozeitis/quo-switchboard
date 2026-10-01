import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store';

test('profiles survive restart and settings are private to the OS user', () => {
  const dir = mkdtempSync(join(tmpdir(), 'switchboard-store-'));
  try {
    const first = new Store(dir);
    const account = { id: '00000000-0000-4000-8000-000000000001', name: 'Studio', color: 'blue' as const };
    first.save({ ...first.value, accounts: [account], activeId: account.id });
    const second = new Store(dir);
    assert.deepEqual(second.value, first.value);
    assert.equal(statSync(first.path).mode & 0o777, 0o600);
    assert.throws(() => first.save({ ...first.value, accounts: [account, account] }));
    assert.deepEqual(new Store(dir).value, second.value);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('corrupt settings are never silently replaced, preserving recoverable login profiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'switchboard-store-'));
  try {
    const path = join(dir, 'workspaces.json');
    writeFileSync(path, '{broken');
    assert.throws(() => new Store(dir));
    assert.equal(readFileSync(path, 'utf8'), '{broken');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
