# Pull request CI baseline

Aspire 101 validates pull requests targeting `main` before merge with the repository workflow at `.github/workflows/ci.yml`.

## Current workflow

The `CI` workflow runs on pull requests targeting `main` and can also be started manually with `workflow_dispatch`.

The current job is named **Validate** and runs:

1. checkout;
2. Node.js 22;
3. `npm install --no-audit --no-fund`;
4. `npm run build`.

This workflow is intentionally independent of production secrets, Stripe credentials, Supabase service credentials, Shippo credentials, and live payment configuration.

Vercel preview deployments remain a separate preview/build signal.

## Verified 2026-09-22

A recent pull request head completed the GitHub Actions `CI` workflow successfully, so the **Validate** check now has real repository history and can be selected as a required check in branch protection/rulesets.

## Branch protection follow-up

Repository settings still need to enforce the workflow. The intended `main` policy is:

- require a pull request before merge;
- require the GitHub Actions **Validate** check;
- require the Vercel deployment/check used for pull-request previews;
- block force pushes to `main`;
- block branch deletion;
- keep administrator bypass limited to emergency use;
- do not require production secrets in CI.

Do not treat a green Vercel preview by itself as the full merge gate once branch protection is enabled.

## Canonical branch note

Production development and Vercel production deployments use `main`, while the GitHub repository default branch is still `v2`.

Do not delete, force-reset, or blindly merge `v2` into `main`. The two branches have diverged and require an intentional migration/reconciliation plan before the default branch is changed.
