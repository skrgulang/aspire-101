# Production recovery runbook — Aspire 101

## Purpose

A practical recovery order for common production incidents. This is an operating guide, not a guarantee of recovery time.

## Recovery principles

- Preserve evidence before changing production.
- Prefer rollback / known-good deployment over speculative hotfixes during an outage.
- Do not rotate every secret at once unless compromise requires it.
- Keep Stripe financial state, Supabase application state, and external provider state reconciled.
- Do not delete failed webhook records or financial audit records to make dashboards look clean.

## Scenario 1 — Bad Vercel deployment

1. Confirm the user-visible failure and affected routes.
2. Check the latest deployment and runtime errors.
3. Compare with the last known-good production deployment.
4. If the failure clearly began with the latest release, restore service using the last known-good deployment / rollback path.
5. After service is restored, fix forward through a PR and preview deployment.
6. Recheck:
   - /api/health
   - login/signup
   - discover/post
   - connections/chat
   - marketplace
   - moderator/founder admin surfaces
   - payment route availability without initiating real money movement

## Scenario 2 — Supabase application regression

1. Determine whether the issue is schema, RLS, function, auth, or data.
2. Identify the migration or change that introduced it.
3. Avoid ad-hoc destructive SQL.
4. For policy/function regressions, prefer a targeted corrective migration.
5. For data-loss scenarios, stop writes if needed and use the provider-supported restore process rather than manually reconstructing partial data.
6. After recovery, validate auth, RLS, RPCs, and critical transaction records.

## Scenario 3 — Stripe webhook outage

1. Confirm Stripe itself is healthy and the production webhook endpoint is reachable.
2. Check webhook delivery status and application logs.
3. Do not manually mark a payment paid/released only because a user says they paid.
4. Reconcile event IDs and payment intent IDs against Aspire records.
5. Use idempotent replay/reprocessing paths where supported.
6. Confirm no duplicate transfer/refund is created.

## Scenario 4 — Transactional email outage

1. Separate human mailbox issues from Supabase Auth / Resend transactional email.
2. Check Resend lifecycle events.
3. Check Supabase Auth timestamps.
4. Do not repeatedly resend to hard-bounced/suppressed addresses.
5. If provider credentials are rotated, validate one controlled signup/recovery before declaring recovery.

## Scenario 5 — Credential exposure

1. Identify exactly which credential is exposed and where.
2. Determine blast radius and dependent services.
3. Revoke/rotate the exposed credential.
4. Update only required deployment environments.
5. Redeploy/restart dependent services if required.
6. Validate affected flow.
7. Search repository/logs/history for further exposure.
8. Record incident timeline and follow-up action.

## Scenario 6 — Admin account compromise

1. Revoke active sessions / provider access as supported.
2. Rotate account password and recovery methods.
3. Verify MFA.
4. Review recent moderator/admin actions.
5. Review provider audit logs where available.
6. Remove unexpected staff roles.
7. Preserve evidence.

## Critical post-recovery checks

- Production deployment READY.
- /api/health returns 200.
- Supabase project reachable.
- Sign-in works.
- Moderator/admin authorization still requires MFA.
- Stripe webhook receives events.
- Resend webhook receives lifecycle events.
- No new runtime-error cluster.
- No unexplained live payment / refund / payout changes.

## Recovery ownership

Until dedicated operators exist, recovery is founder-led. Any future support/operations account should receive only the minimum permissions needed and should not receive direct financial or infrastructure-admin access by default.
