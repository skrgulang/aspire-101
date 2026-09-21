# Aspire 101 disaster recovery runbook

## Objective

Restore a safe production service after a bad deployment, application regression, database incident, provider outage, or credential/security event without making the incident worse.

This runbook documents recovery order. It does not claim that every provider backup feature is enabled.

## Sources of truth

- Application source / migrations: GitHub
- Web deployments: Vercel
- Database / auth / storage: Supabase
- Payments / Connect: Stripe
- Transactional email: Resend
- Browser reliability: Datadog
- Product behavior analytics: Amplitude

Financial truth remains Stripe + Aspire payment records, not analytics.

## 1. Bad web deployment

Symptoms:
- production route errors after merge;
- sudden browser/runtime errors;
- broken signup / checkout / moderation page.

Actions:

1. Identify the first bad deployment and last known-good production deployment.
2. Check Vercel runtime errors and build logs.
3. If impact is material, restore/redeploy the last known-good application commit rather than stacking emergency code changes.
4. Confirm `/api/health`.
5. Smoke-test auth, core discovery, connection, moderation, and any affected payment path.
6. Record incident timestamps and root cause.

Do not change Stripe, Supabase schema, or secrets merely because the frontend deployment failed.

## 2. Database migration incident

Symptoms:
- RPC missing;
- permission failures across a feature;
- schema mismatch;
- migration causes queries to fail.

Actions:

1. Stop further schema changes.
2. Identify the exact migration / DDL change.
3. Determine whether rollback is safe or whether a forward-fix is safer.
4. Reproduce against a Supabase development branch when feasible.
5. Preserve transaction/safety evidence.
6. Apply only the smallest reviewed database change needed.
7. Re-run Supabase security/performance advisors after DDL changes.

Do not use destructive restore operations as the first response.

## 3. Supabase branch state

Current branch inventory includes:

- `main` — production/default project
- `pr91-baseline-repair` — non-default preview branch, currently healthy

The preview branch should be reviewed for ongoing need. Supabase development branches can have cost implications. Do not delete it automatically because deletion is destructive to branch-only data/schema state.

## 4. Database project unavailable

1. Confirm the incident is Supabase-side versus application-side.
2. Avoid repeated writes/retries that can create duplicate business actions.
3. Put user-facing risky actions into fail-closed behavior where possible.
4. Do not attempt a project restore unless the project state and restore consequences are understood.
5. After recovery, reconcile payment/webhook events that may have arrived while the application was unavailable.

## 5. Stripe outage / webhook interruption

1. Do not infer payment success from the browser redirect alone.
2. Stripe / Aspire webhook-backed records remain transaction truth.
3. Preserve webhook idempotency.
4. Pause payout/release automation if state is uncertain.
5. Reconcile events after recovery.
6. Never issue duplicate refunds/transfers because a client timed out.

## 6. Resend / auth-email outage

1. Distinguish mailbox email from Supabase Auth transactional email.
2. Check lifecycle events / bounce / failure state.
3. Avoid repeated resend loops to hard-bounced or suppressed addresses.
4. Do not change mail provider credentials during a temporary provider outage unless necessary.

## 7. Credential exposure

1. Identify the credential and where it is used.
2. Stop further exposure (public repo, logs, screenshots, etc.).
3. Rotate only after mapping dependent services.
4. Update the minimum required environment/config surfaces.
5. Redeploy / restart as required.
6. Invalidate old credential.
7. Check logs/audit events for misuse.
8. Document impact and follow-up.

Do not paste replacement secrets into tickets, docs, analytics, or chat logs.

## 8. Sensitive-data incident

Examples:
- unintended profile/message access;
- delivery address exposure;
- location exposure;
- safety report access;
- identity metadata leakage.

Actions:

1. Restrict the affected read/write path.
2. Preserve logs and evidence.
3. Determine data categories, time window, and affected accounts.
4. Avoid broad data deletion before preserving incident evidence.
5. Escalate for legal/privacy review when appropriate.
6. Patch authorization and validate with role-specific tests.
7. Record remediation.

## 9. Recovery validation

Before declaring recovery:

- production deployment READY;
- `/api/health` returns 200;
- Supabase project reports healthy;
- affected RPC/table permissions work for intended roles only;
- no new Datadog error cluster;
- Stripe webhook/payment reconciliation clean if payments affected;
- Resend lifecycle normal if auth email affected;
- moderator/founder operations access works if staff paths affected.

## 10. After-action record

For meaningful incidents, record:

- incident start;
- detection;
- user impact;
- affected systems;
- root cause;
- containment;
- recovery;
- data / financial impact;
- changes made;
- follow-up owner;
- prevention work.

## Planned hardening

- decide whether the old `pr91-baseline-repair` Supabase branch is still needed;
- test database security migrations in a branch before production when risk is meaningful;
- maintain a clear last-known-good application commit / deployment;
- keep live payments fail-closed when transaction state cannot be trusted.
