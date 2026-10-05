# Dependency maintenance

Dependabot checks npm and GitHub Actions at 9 a.m. America/Los_Angeles every calendar day. Routine npm updates and security fixes use separate groups. Major versions are included. Security-fix PRs can arrive sooner when GitHub detects an advisory.

Routine version updates use GitHub's default three-day release cooldown; security updates do not. npm version updates maintain direct dependencies. If an indirect dependency has an available update before GitHub recognizes a usable security fix, it needs a separate reviewed PR and the same required checks. A successful Dependabot run does not establish that the current lockfile passes the security audit.

`Checks` also runs every day at 16:23 UTC. It includes Mac type, unit, and desktop tests; a full-history secret scan; and `npm audit --audit-level=low`. The audit includes development dependencies because Electron and bundled libraries live there. Installation scripts are disabled in the audit job. An unavailable advisory service fails the check.

After successful checks, `Dependency maintenance` squash-merges qualifying Dependabot PRs. A daily retry runs at 16:43 UTC. Only dependency versions in existing npm manifests and lockfiles, or pinned action references in existing workflows, qualify. Manifest scripts, application code, new packages, unpinned actions, and changed workflow logic need review.

The merge job runs policy from the default branch. It never checks out or executes PR code with a write token. It requires a successful current `Checks` run with all three jobs actually successful, strict branch protection tied to the GitHub Actions app, an up-to-date base, and an unchanged PR head. It reads the branch summary and applied rules through REST endpoints available to `GITHUB_TOKEN`; no administration token is stored in CI. GitHub enforces protection again when merging. Missing, skipped, neutral, cancelled, or failed checks leave the PR open. Other required reviews or unresolved conversations also block merging.

## Enable after the first upload

Wait for `Checks` to pass on the uploaded default-branch commit. Then run:

```sh
node scripts/configure-maintenance.mjs
```

This enables Dependabot alerts, security fixes, squash merging, and branch deletion after merging. It protects the default branch with required `audit`, `secrets`, and `test` checks, requires the branch to be current, prevents force pushes and deletion, and enforces protection for administrators. A matching active ruleset exposes strict freshness and the check integration IDs to CI using Metadata read access. It has no bypass actors. Existing protection is preserved; setup refuses to replace a different policy. Private repositories need a GitHub plan that supports branch protection. No personal access token is placed in CI.

Until source and protection are deployed, automatic merging is inactive. The local daily Codex check reports that deployment blocker and monitors actionable failures. Dependabot schedules are defined in the repository; they do not depend on Codex being open. Repository visibility is never changed by maintenance. Dependency merges update source; installing or publishing a Mac release remains a separate action.

References: [Dependabot schedules and groups](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference), [automating Dependabot safely](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/automate-dependabot-with-actions), [applied branch rules and token permissions](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).
