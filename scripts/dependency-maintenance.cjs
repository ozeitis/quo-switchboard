'use strict';

const { isDeepStrictEqual } = require('node:util');

const requiredChecks = ['audit', 'secrets', 'test'];
const actionsAppId = 15368;
const dependencyKeys = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const version = /^(?:[~^])?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const actionReference = /^([ \t]*-?[ \t]*uses:[ \t]+)([\w.-]+\/[\w./-]+)@[a-f0-9]{40}(?:[ \t]+#.*)?[ \t]*$/gm;

function isDependencyPullRequest(pr, repository, branch) {
  return pr.state === 'open' && !pr.draft && pr.user?.login === 'dependabot[bot]' &&
    pr.user.type === 'Bot' && pr.base?.ref === branch &&
    pr.base.repo?.full_name === repository && pr.head?.repo?.full_name === repository &&
    pr.head.ref.startsWith('dependabot/');
}

function hasRequiredProtection(rule) {
  return rule?.requiresStatusChecks === true && rule.requiresStrictStatusChecks === true &&
    rule.isAdminEnforced === true && requiredChecks.every(name =>
      rule.requiredStatusChecks?.some(check => check.context === name && check.app?.databaseId === actionsAppId));
}

function hasRequiredBranchChecks(branch) {
  const checks = branch?.protection?.required_status_checks;
  return branch?.protected === true && branch.protection.enabled === true &&
    checks?.enforcement_level === 'everyone' && requiredChecks.every(name =>
      checks.checks?.some(check => check.context === name && check.app_id === actionsAppId));
}

function hasStrictRules(rules) {
  return Array.isArray(rules) && rules.some(rule => rule.type === 'required_status_checks' &&
    rule.parameters?.strict_required_status_checks_policy === true && requiredChecks.every(name =>
      rule.parameters.required_status_checks?.some(check =>
        check.context === name && check.integration_id === actionsAppId)));
}

function isDependencyManifest(before, after) {
  for (const key of dependencyKeys) {
    const oldDependencies = before[key] ?? {};
    const newDependencies = after[key] ?? {};
    if (!isDeepStrictEqual(Object.keys(oldDependencies).sort(), Object.keys(newDependencies).sort())) return false;
    for (const name of Object.keys(newDependencies)) {
      if (oldDependencies[name] !== newDependencies[name] &&
          (typeof newDependencies[name] !== 'string' || !version.test(newDependencies[name]))) return false;
    }
  }
  const withoutDependencies = manifest => Object.fromEntries(Object.entries(manifest)
    .filter(([key]) => !dependencyKeys.includes(key)));
  return isDeepStrictEqual(withoutDependencies(before), withoutDependencies(after));
}

function isActionVersionUpdate(before, after) {
  const normalize = text => text.replace(actionReference, '$1$2@PIN');
  return before !== after && normalize(before) === normalize(after);
}

function passedChecks(run, jobs, sha) {
  return run?.head_sha === sha && run.status === 'completed' && run.conclusion === 'success' &&
    requiredChecks.every(name => jobs.some(job => job.name === name &&
      job.status === 'completed' && job.conclusion === 'success'));
}

async function mergeDependencyUpdates({ github, context, core }) {
  const repo = context.repo;
  const { data: settings } = await github.rest.repos.get(repo);
  const repository = settings.full_name;
  const branch = settings.default_branch;
  // Applied rules need only Metadata access; classic rule details need Administration.
  const protection = async () => {
    const { data: base } = await github.rest.repos.getBranch({ ...repo, branch });
    const rules = await github.paginate(github.rest.repos.getBranchRules, { ...repo, branch, per_page: 100 });
    if (!hasRequiredBranchChecks(base) || !hasStrictRules(rules)) {
      throw new Error('Dependency merges require strict main protection with audit, secrets, and test from GitHub Actions. Run scripts/configure-maintenance.mjs after deployment.');
    }
    return base;
  };
  if (!settings.allow_auto_merge || !settings.allow_squash_merge ||
      !settings.default_branch) {
    throw new Error('Dependency merges require strict main protection with audit, secrets, and test from GitHub Actions. Run scripts/configure-maintenance.mjs after deployment.');
  }
  await protection();

  const candidates = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', base: branch, per_page: 100 });
  const readFile = async (path, ref) => {
    const { data } = await github.rest.repos.getContent({ ...repo, path, ref });
    if (data.type !== 'file' || data.encoding !== 'base64') throw new Error(`Cannot inspect ${path}`);
    return Buffer.from(data.content, 'base64').toString('utf8');
  };

  for (const candidate of candidates) {
    if (!isDependencyPullRequest(candidate, repository, branch)) continue;
    const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: candidate.number });
    if (!isDependencyPullRequest(pr, repository, branch)) continue;
    const files = await github.paginate(github.rest.pulls.listFiles, { ...repo, pull_number: pr.number, per_page: 100 });
    let allowed = files.length > 0 && files.length === pr.changed_files;
    for (const file of files) {
      if (file.status !== 'modified') { allowed = false; break; }
      if (file.filename === 'package-lock.json') continue;
      if (file.filename !== 'package.json' && !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.filename)) {
        allowed = false; break;
      }
      const [before, after] = await Promise.all([
        readFile(file.filename, pr.base.sha), readFile(file.filename, pr.head.sha)
      ]);
      if (file.filename === 'package.json' ? !isDependencyManifest(JSON.parse(before), JSON.parse(after)) :
          !isActionVersionUpdate(before, after)) { allowed = false; break; }
    }
    if (!allowed) { core.warning(`PR #${pr.number} changes more than dependency versions; leaving it open.`); continue; }

    const { data } = await github.rest.actions.listWorkflowRuns({ ...repo, workflow_id: 'ci.yml',
      event: 'pull_request', head_sha: pr.head.sha, per_page: 100 });
    const run = data.workflow_runs.filter(run => run.pull_requests.some(item => item.number === pr.number))
      .sort((a, b) => b.id - a.id)[0];
    if (!run) { core.info(`PR #${pr.number} has no current Checks run.`); continue; }
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun,
      { ...repo, run_id: run.id, filter: 'latest', per_page: 100 });
    if (!passedChecks(run, jobs, pr.head.sha)) { core.info(`PR #${pr.number} is waiting for passing checks.`); continue; }

    const base = await protection();
    const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({ ...repo,
      basehead: `${base.commit.sha}...${pr.head.sha}` });
    if (comparison.status !== 'ahead') { core.info(`PR #${pr.number} needs to be rebased and tested again.`); continue; }
    const { data: latest } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
    if (!isDependencyPullRequest(latest, repository, branch) || latest.head.sha !== pr.head.sha ||
        latest.mergeable_state !== 'clean') { core.info(`PR #${pr.number} changed or is not ready to merge.`); continue; }
    try {
      // GitHub enforces branch protections and rejects a changed head SHA atomically.
      const { data: result } = await github.rest.pulls.merge({ ...repo, pull_number: pr.number,
        sha: pr.head.sha, merge_method: 'squash' });
      if (!result.merged) throw new Error(result.message);
      core.notice(`Merged dependency PR #${pr.number}: ${result.sha}`);
    } catch (error) {
      if (![405, 409].includes(error.status)) throw error;
      core.warning(`PR #${pr.number} was blocked by GitHub or changed before merge; leaving it open.`);
    }
  }
}

module.exports = { requiredChecks, isDependencyPullRequest, hasRequiredProtection, hasRequiredBranchChecks, hasStrictRules,
  isDependencyManifest, isActionVersionUpdate, passedChecks, mergeDependencyUpdates };
