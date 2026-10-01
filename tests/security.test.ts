import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountNavigation, appOrigin, cleanText, externalURL, RateLimit } from '../src/main/policy';
import { emptyConfig, parseConfig, partitionFor } from '../src/shared/model';

test('only the exact Quo app origins receive the page bridge', () => {
  assert.equal(appOrigin('https://my.quo.com/inbox'), true);
  for (const url of ['http://my.quo.com', 'https://my.quo.com.evil.example', 'https://quo.com', 'https://auth.quo.com', 'file:///tmp/index.html', 'javascript:alert(1)']) assert.equal(appOrigin(url), false, url);
});
test('navigation and external links reject credential tricks and dangerous schemes', () => {
  assert.equal(accountNavigation('https://auth.openphone.com/login'), true);
  for (const url of ['https://my.quo.com@evil.example', 'https://evil.example@my.quo.com', 'https://accounts.google.com', 'file:///etc/passwd']) assert.equal(accountNavigation(url), false);
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'data:text/html,test', 'http://example.com', 'https://user:secret@example.com']) assert.equal(externalURL(url), false);
  assert.equal(externalURL('https://example.com/docs'), true);
});
test('workspace partitions are stable, distinct, and cannot be path-injected', () => {
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  assert.equal(partitionFor(a), partitionFor(a));
  assert.notEqual(partitionFor(a), partitionFor(b));
  assert.throws(() => partitionFor('../../default'));
});
test('settings reject duplicate profile identifiers instead of sharing logins', () => {
  const account = { id: '00000000-0000-4000-8000-000000000001', name: 'Studio', color: 'blue' };
  assert.throws(() => parseConfig({ ...emptyConfig(), accounts: [account, account] }));
  assert.throws(() => parseConfig({ ...emptyConfig(), version: 2 }));
  assert.throws(() => parseConfig({ ...emptyConfig(), accounts: [{ ...account, name: '\u0000hidden' }] }));
});
test('removed active accounts fall back without retaining unknown settings', () => {
  const account = { id: '00000000-0000-4000-8000-000000000001', name: ' Studio ', color: 'blue' };
  const config = parseConfig({ ...emptyConfig(), activeId: 'missing', accounts: [account], injected: 'ignore' });
  assert.equal(config.activeId, account.id);
  assert.equal(config.accounts[0]?.name, 'Studio');
  assert.equal('injected' in config, false);
});
test('notification content cannot use control characters to spoof its account label', () => {
  assert.equal(cleanText('\u202eHello\u0000world', 40), 'Hello world');
  assert.equal(cleanText('a'.repeat(1000), 160).length, 160);
  const limit = new RateLimit(2, 100);
  assert.equal(limit.accept(1, 0), true);
  assert.equal(limit.accept(1, 1), true);
  assert.equal(limit.accept(1, 2), false);
  assert.equal(limit.accept(2, 2), true);
  assert.equal(limit.accept(1, 100), true);
});
