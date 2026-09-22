# Pull request CI baseline

Aspire 101 now validates pull requests targeting `main` before merge.

The workflow runs:

1. dependency installation on Node.js 22;
2. the existing Aspire Brain regression suite;
3. a full TypeScript `--noEmit` check.

Vercel preview deployments remain the build/runtime preview gate. This CI is intentionally independent of production secrets, Stripe credentials, Supabase service credentials, and live payment configuration.

## Branch protection follow-up

Once the workflow has completed successfully on at least one pull request, configure the repository ruleset for `main` to require the **Validate** check before merge. Keep Vercel's preview/deployment check required as a separate build gate.

Do not add production secrets to this workflow unless a later test explicitly requires them.
