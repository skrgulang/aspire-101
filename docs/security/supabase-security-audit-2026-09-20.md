# Supabase security audit — 2026-09-20

Scope: read-only review of Supabase Security Advisor findings and database metadata for Aspire 101.

## Verified controls

- Sensitive operational tables such as `public.user_roles`, `public.stripe_webhook_events`, and `public.product_analytics_events` have RLS enabled and no `anon` or `authenticated` grants. With no policies, they are effectively default-deny to normal client roles.
- `public.connection_messages` uses participant-scoped policies: authenticated users can read messages only when they are a participant in the linked connection, and inserts require the authenticated sender plus the connection messaging guard.
- `public.marketplace_listing_drafts` uses owner-scoped SELECT/INSERT/UPDATE/DELETE policies based on `auth.uid()`.
- `public.profiles` has authenticated read access mediated by `can_view_profile_row(id)` and update access restricted to the user's own row.
- `public.requests` uses owner/moderator/approved-request rules rather than unrestricted row access.
- High-privilege SECURITY DEFINER functions inspected in this audit include explicit internal role checks:
  - `set_moderator_by_email` requires `is_admin()`.
  - `admin_activity_metrics` requires `is_admin()`.
  - moderator fetch/enforcement functions require moderator/admin checks.
  - resolution review functions require moderator checks.

## Advisor findings that are not automatically vulnerabilities

- `RLS enabled, no policy` can be intentional when a table is server-only. Do not add permissive policies just to silence this lint.
- PostGIS objects such as `spatial_ref_sys`, `geometry_columns`, `geography_columns`, and PostGIS SECURITY DEFINER functions can generate linter warnings. Treat them separately from application-owned data.
- SECURITY DEFINER linting flags callable functions even when the function itself performs authorization checks. Each function should be evaluated by behavior, not by lint title alone.

## Remaining review queue

1. Review GraphQL visibility for application-owned tables and revoke broad schema visibility where the client does not need direct access.
2. Continue auditing SECURITY DEFINER functions that are callable by `authenticated`, especially admin/moderator/payment-sensitive RPCs, to ensure every one performs its own authorization and input validation.
3. Consolidate duplicate indexes reported by Performance Advisor only after confirming query usage and migration history.
4. Review multiple permissive RLS policies on legacy tables (especially older `tasks`, `task_messages`, and support tables) and remove redundant legacy policies after regression testing.
5. Re-run Security Advisor after every database-policy migration.

References:
- https://supabase.com/docs/guides/database/database-linter
- https://supabase.com/docs/guides/database/postgres/row-level-security
