import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import policy from './dependency-maintenance.cjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args, input) => execFileSync(command, args, { cwd: root, encoding: 'utf8', input }).trim();
const api = (path, method = 'GET', body) => {
  const args = ['api', path, '--method', method];
  if (body !== undefined) args.push('--input', '-');
  const result = run('gh', args, body === undefined ? undefined : JSON.stringify(body));
  return result ? JSON.parse(result) : undefined;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const { nameWithOwner } = JSON.parse(run('gh', ['repo', 'view', '--json', 'nameWithOwner']));
const endpoint = `repos/${nameWithOwner}`;
const settings = api(endpoint);
const branch = settings.default_branch;
assert(!run('git', ['status', '--porcelain']), 'Commit local changes before configuring maintenance.');
const sha = run('git', ['rev-parse', 'HEAD']);
const current = api(`${endpoint}/branches/${encodeURIComponent(branch)}`);
assert(current.commit.sha === sha, 'Upload the reviewed source to the default branch first.');

const runs = api(`${endpoint}/actions/workflows/ci.yml/runs?event=push&head_sha=${sha}&per_page=100`).workflow_runs;
const latest = runs.sort((a, b) => b.id - a.id)[0];
assert(latest, 'Wait for the Checks workflow on the uploaded commit.');
const jobs = api(`${endpoint}/actions/runs/${latest.id}/jobs?filter=latest&per_page=100`).jobs;
assert(policy.passedChecks(latest, jobs, sha), 'Mac tests, audit, and secret scan must pass before enabling protection.');

if (current.protected) {
  const [owner, repo] = nameWithOwner.split('/');
  const result = JSON.parse(run('gh', ['api', 'graphql', '-f', `query=query($owner:String!,$repo:String!){
    repository(owner:$owner,name:$repo){defaultBranchRef{branchProtectionRule{
      isAdminEnforced requiresStatusChecks requiresStrictStatusChecks
      requiredStatusChecks{context app{databaseId}}
    }}}}`, '-f', `owner=${owner}`, '-f', `repo=${repo}`]));
  assert(policy.hasRequiredProtection(result.data.repository.defaultBranchRef.branchProtectionRule),
    'Existing protection needs review. This setup will not replace or weaken it.');
} else {
  api(`${endpoint}/branches/${encodeURIComponent(branch)}/protection`, 'PUT', {
    required_status_checks: { strict: true, checks: policy.requiredChecks.map(context => ({ context, app_id: 15368 })) },
    enforce_admins: true,
    required_pull_request_reviews: { required_approving_review_count: 0, dismiss_stale_reviews: true },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  });
}
const rulesetName = 'Switchboard dependency checks';
const rulesets = api(`${endpoint}/rulesets?per_page=100`).filter(rule => rule.name === rulesetName && rule.source === nameWithOwner);
assert(rulesets.length <= 1, 'Multiple dependency rulesets need review.');
if (rulesets.length) {
  const ruleset = api(`${endpoint}/rulesets/${rulesets[0].id}`);
  const refs = ruleset.conditions?.ref_name;
  assert(ruleset.target === 'branch' && ruleset.enforcement === 'active' &&
    Array.isArray(ruleset.bypass_actors) && ruleset.bypass_actors.length === 0 &&
    Array.isArray(refs?.include) && refs.include.length === 1 && refs.include[0] === '~DEFAULT_BRANCH' &&
    Array.isArray(refs.exclude) && refs.exclude.length === 0 &&
    policy.hasStrictRules(ruleset.rules), 'Existing dependency ruleset needs review. Setup will not weaken it.');
} else {
  api(`${endpoint}/rulesets`, 'POST', {
    name: rulesetName, target: 'branch', enforcement: 'active', bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [{ type: 'required_status_checks', parameters: {
      strict_required_status_checks_policy: true,
      required_status_checks: policy.requiredChecks.map(context => ({ context, integration_id: 15368 }))
    } }]
  });
}
api(`${endpoint}/vulnerability-alerts`, 'PUT');
api(`${endpoint}/automated-security-fixes`, 'PUT');
api(endpoint, 'PATCH', { allow_auto_merge: true, allow_squash_merge: true, delete_branch_on_merge: true });
console.log(`Daily dependency maintenance configured for ${nameWithOwner}. Repository visibility is unchanged.`);
