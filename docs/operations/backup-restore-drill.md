# Aspire 101 backup & recovery drill

This is a non-destructive quarterly recovery exercise for Cloudora Labs, Inc. It validates that the team can identify the last known-good state and recover the service without intentionally breaking production or moving real money.

## Recovery sources

- **GitHub / migrations:** source code, database migrations, operational runbooks.
- **Vercel:** immutable deployments and rollback candidates.
- **Supabase:** production Postgres/Auth/Storage plus provider backups/PITR according to the active plan.
- **Stripe:** source of truth for provider-side payment objects and webhook event history.
- **Email providers:** source of truth for delivery state.
- **Shippo:** source of truth for provider-side label/tracking objects.

## Quarterly drill

### 1. Establish current healthy baseline

- Latest Vercel production deployment is READY.
- `/api/health` returns 200.
- Record the current production commit SHA.
- Record critical aggregate counts only (users, requests, connections, payments, orders); do not export user content into the drill notes.
- Confirm no unresolved SEV-0/SEV-1 incident is active.

### 2. Identify rollback point

- Find the previous known-good Vercel production deployment.
- Confirm it is still available as a rollback candidate.
- Review the database migrations introduced between that deployment and production.
- Decide whether an application-only rollback is safe or whether the schema change requires a forward fix.

Do not perform a production rollback just to prove the button works.

### 3. Verify Supabase recovery readiness

- Confirm the active Supabase plan's backup/PITR capability and current retention window in the Supabase dashboard.
- Verify migrations in GitHub match production migration history.
- Confirm storage buckets and critical server-only tables are included in the recovery inventory.
- Use a disposable/dev branch for restore/schema-replay exercises when available; never overwrite production for a drill.
- Verify that restored application data would still require current secrets/environment configuration before it can serve traffic.

### 4. Application smoke test

After any real recovery, test:

1. sign in / auth refresh;
2. create and discover a free request;
3. response → choose → confirm → message → complete;
4. profile read/update;
5. moderator queues;
6. ambassador application read path;
7. marketplace read path.

Financial actions should be inspected, not replayed, unless the incident specifically requires a controlled recovery action.

### 5. Provider reconciliation

- Stripe: compare Aspire payment/order state to Stripe provider state before retrying a financial action.
- Resend/SMTP: verify provider delivery state before repeatedly resending.
- Shippo: reconcile an already-created provider label/transaction before attempting a replacement purchase.
- Datadog/Vercel: confirm error rate and latency return to baseline.

## Evidence to record

- Drill date and operator.
- Production commit/deployment used as baseline.
- Backup/PITR window observed.
- Recovery path chosen.
- Smoke-test results.
- Any dependency that could not be restored/reconciled.
- Follow-up issue(s) with owners.

## Current known follow-up

The active connector does not expose Supabase backup/PITR configuration directly, so the provider backup window must be verified in the Supabase dashboard and recorded here before broad launch.
