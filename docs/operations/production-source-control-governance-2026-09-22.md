# Production source-control governance — 2026-09-22

## Current verified state

- Production development branch: `main`
- Vercel production deployments observed from: `main`
- GitHub repository default branch: `v2`
- GitHub repository visibility: public
- Repository rulesets: none
- `main` branch protected: no
- `v2` branch protected: no
- Pull-request CI: present for PRs targeting `main`
- CI job name: `Validate`
- Current CI command: `npm run build` after dependency installation

## Branch divergence

At the 2026-09-22 audit point, GitHub reports `v2...main` as **diverged**:

- `main` is 592 commits ahead of the merge base relative to `v2`;
- `v2` has 123 commits not present on `main`;
- the comparison spans at least 300 changed files.

This means changing the default branch to `main` may be operationally appropriate, but **deleting or resetting `v2` is not safe without first reviewing its unique commits**.

## Intended steady state

1. `main` is the canonical/default branch.
2. Production deploys only from `main`.
3. Changes land through pull requests except documented emergency fixes.
4. `main` requires:
   - GitHub Actions `Validate`;
   - Vercel preview/deployment check;
   - pull request review/merge path;
   - no force push;
   - no deletion.
5. `v2` becomes historical only after its unique commits are reviewed and any still-needed changes are ported deliberately.

## Safe migration sequence

### Phase 1 — protect production first

Before changing or deleting any branch:

1. Add a ruleset/branch protection rule for `main`.
2. Require **Validate**.
3. Require the Vercel PR check used by this repository.
4. Confirm a test PR cannot merge while either required check is failing/pending.
5. Confirm Vercel still creates production deployments from merged `main`.

### Phase 2 — review `v2`

1. Inventory the 123 commits unique to `v2`.
2. Categorize them as:
   - already superseded on `main`;
   - still needed and should be ported;
   - obsolete/experimental.
3. Port only the still-needed changes through ordinary PRs to `main`.
4. Re-run application tests and production preview checks.

Do **not** bulk-merge `v2` into `main` merely to eliminate divergence.

### Phase 3 — change default branch

After Phase 1 and the `v2` review:

1. Change GitHub default branch from `v2` to `main`.
2. Re-check:
   - new PRs default to `main`;
   - repository links/docs do not assume `v2`;
   - automation/bots target `main`;
   - Vercel remains mapped to `main`.
3. Keep `v2` temporarily as a read-only historical branch.
4. Delete `v2` only after a separate explicit decision.

## Current tooling limitation

The connected GitHub integration can inspect repository metadata, branches, CI runs, and repository rulesets, but the active integration does not expose an administration write action for changing the repository default branch or creating branch-protection/ruleset configuration. Those settings therefore require a GitHub Settings action by the repository owner.

This is a control-plane limitation, not a code blocker.

## Emergency changes

If a production emergency requires bypassing normal PR flow:

- document the reason and exact commit;
- run the production build locally or in CI before/after the emergency change where possible;
- verify the resulting Vercel production deployment;
- open a follow-up issue/PR to restore the normal protected path;
- never use an emergency bypass to make unrelated changes.

Stripe/payment and live database changes keep their own stricter approval rules and are not made safer merely because a source-control check is green.
