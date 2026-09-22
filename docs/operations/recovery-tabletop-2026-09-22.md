# Production recovery tabletop — 2026-09-22

Status: **non-destructive tabletop completed**. No production rollback, payment action, shipping-label purchase, user-data mutation, or secret rotation was performed.

## Baseline

- Vercel production deployment: `dpl_HMnERehPckgPxUYD4F8WBT5SuykH`
- Production commit: `9b7e5615c81729ce85eacd441a9fff586de5cd8d`
- Deployment state at check: **READY**
- Vercel runtime error clusters over the preceding six hours: **none**
- Supabase production project: **ACTIVE_HEALTHY**
- Postgres: 17.6.1.011 / Postgres 17
- Region: us-east-2

## Production data shape

Aggregate counts at the time of the drill:

| Surface | Count |
| --- | ---: |
| Profiles | 35 |
| Requests | 17 |
| Request responses | 7 |
| Connections | 7 |
| Connection payments | 2 |
| Market orders | 2 |
| Resolution cases | 0 |
| Notifications | 72 |

These are aggregate recovery reference points only. No private user content was exported into this report.

## Staff recovery access

Authoritative `public.user_roles` state:

- Admin: 1
- Admin with a verified MFA factor: 1
- Moderator: 0

This supports the current recovery policy: production moderation/admin access remains MFA-gated and no support account should be promoted merely to make a recovery drill easier.

## Database migration baseline

Latest production migrations observed:

1. `20260922044025 restore_response_withdraw_rpc`
2. `20260922044021 gate_request_responses_on_moderation`
3. `20260922035651 marketplace_reservation_cancel_ux`
4. `20260922030812 expire_unpaid_marketplace_reservations`
5. `20260922023822 market_order_notification_sync`

For an incident rollback, compare the affected deployment's expected schema with this migration history before rolling application code backward. Prefer a forward database fix when an application rollback would become schema-incompatible.

## Recovery-path checks

### Vercel

PASS:
- A current production deployment is READY.
- Prior READY production deployments remain visible as rollback candidates.
- Runtime error clusters can be checked independently of deployment state.

Rule: do not perform a production rollback merely to exercise the control.

### Supabase

PASS:
- Production project reports ACTIVE_HEALTHY.
- Migration history is queryable and current.
- A separate development branch exists and is healthy.

OPEN:
- The provider backup/PITR plan and exact retention window are not exposed by the current connector and still need to be verified in the Supabase dashboard.
- The old `pr91-baseline-repair` development branch remains active. Review whether it contains any unique work; do not delete it automatically.

### Application smoke/recovery path

Previously validated non-destructively in production/rollback transactions:

- free request creation/lifecycle;
- response → choose → confirm;
- response withdrawal and re-response;
- messaging/unread marker behavior;
- completion/cancellation state;
- profile save/read-back;
- moderator-gated RPC behavior;
- no payment artifact creation in the free-task lifecycle.

Financial/provider side effects were deliberately excluded from this drill.

## Advisor follow-up

Supabase advisors still report known cleanup work concentrated in the legacy application surface, including overlapping permissive RLS policies and duplicate legacy `tasks` indexes. These should be handled after the legacy static app dependency audit rather than changed blindly during recovery work.

References:
- Supabase database linter: https://supabase.com/docs/guides/database/database-linter
- Supabase production guidance: https://supabase.com/docs/guides/deployment/going-into-prod

## Result

**Recovery readiness: operational baseline established, with one founder-visible manual verification still required: confirm the active Supabase backup/PITR retention window in the dashboard.**

Do not consider provider backups fully verified until that window is recorded.
