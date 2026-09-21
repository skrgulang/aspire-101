# Supabase security audit — 2026-09-21

## Scope

Read-only review of Supabase advisors, SECURITY DEFINER execution grants, selected staff-sensitive RPCs, and legacy RLS policies. No production database policy was changed during this audit.

## Important finding: legacy task moderator authorization

The canonical staff authorization system uses `public.user_roles` plus AAL2/MFA through `public.is_moderator()` and `public.is_admin()`.

However, `public.tasks` still has two legacy staff policies that authorize directly from `public.profiles.role` / `profiles.is_moderator`:

- `Moderators manage all tasks`
- `tasks_full_for_moderators`

Current aggregate state shows two profiles with legacy moderator-style markers, and one of those does not have an authoritative admin/moderator role in `public.user_roles`.

This creates an inconsistent staff-access path on the legacy `tasks` table. The accompanying migration replaces those profile-based policies with one `tasks_staff_manage` policy using the MFA-gated `public.is_moderator()` function.

The migration is intentionally prepared in source control first rather than applied blindly to production.

## Selected staff-sensitive RPC review

The following authenticated SECURITY DEFINER RPCs were inspected:

- `set_moderator_by_email` — checks `public.is_admin()`.
- `review_school_verification` — checks `public.is_moderator()`.
- `review_connection_resolution_case` — checks `public.is_moderator()`.
- `moderator_review_support_feedback` — checks moderator/admin authorization.
- `admin_activity_metrics` — checks `public.is_admin()`.
- `admin_launch_readiness_metrics` — checks `public.is_admin()`.

Because the current `is_admin` / `is_moderator` functions require an authoritative role and AAL2 for normal signed-in users, these inspected RPCs preserve the intended MFA staff boundary.

## Supabase advisor findings

### RLS enabled, no policy

Several internal tables have RLS enabled with no policies. In sampled cases this is intentional default-deny behavior because anon/authenticated do not have direct access. Treat the advisor message as informational unless an application path actually requires direct client access.

### PostGIS / extension warnings

Supabase reports extensions such as PostGIS, pg_trgm, citext, cube, and earthdistance installed in `public`. Moving extensions can be disruptive and should not be done as a cosmetic linter cleanup without dependency testing.

`public.spatial_ref_sys` is also reported as public / no-RLS. This is a PostGIS-managed table, not an Aspire user-data table. Do not alter it casually.

### GraphQL discoverability

Supabase reports several tables/views as visible in the GraphQL schema to anon or authenticated users because they have SELECT privileges. GraphQL schema visibility is not by itself proof that RLS allows reading every row.

Before revoking privileges, verify whether the current application relies on PostgREST / direct table SELECT for those same roles. The main candidates for review include:

- `campus_cover_images`
- `universities`
- `connection_events`
- `connection_messages`
- `connections`
- `market_price_proposals`
- `marketplace_listing_drafts`
- `profiles`
- `request_drafts`
- `request_media`
- `requests`
- `user_blocks`
- `user_preferences`

Do not bulk-revoke these grants without an application dependency audit.

### SECURITY DEFINER advisor warnings

Supabase reports many authenticated-callable SECURITY DEFINER functions. This is expected for the current RPC-oriented architecture only when each function performs its own authorization and has a fixed search_path.

The audit should therefore be function-by-function, prioritizing:
- staff/admin mutations;
- money/refund/payout operations;
- identity / verification;
- private addresses / locations;
- account enforcement.

The sampled high-risk staff functions listed above contain explicit authorization checks.

### Anonymous PostGIS functions

Three `st_estimatedextent` overloads remain anonymously executable as SECURITY DEFINER functions. These originate from PostGIS. Review whether their exposure can be safely reduced without breaking spatial functionality; do not alter extension-owned functions without dependency testing.

### Duplicate RLS policies

Legacy tables contain multiple overlapping permissive policies, particularly `tasks`, `posts`, `task_messages`, `task_swipes`, and `support_feedback`.

Most sampled duplicate policies repeat the same ownership / participation constraints, but they increase audit complexity. Consolidate them only after confirming which legacy pages and flows remain active.

### Duplicate indexes

Supabase reports duplicate indexes on `public.tasks`:

- created_at: 3 identical indexes;
- status + created_at: 3 identical indexes;
- user/user_id: 4 identical indexes.

This is a performance / maintenance issue, not an urgent security issue. Index cleanup should follow query / dependency review.

## Recommended order

1. Fix the legacy `tasks` staff authorization path.
2. Inventory whether legacy static task/post pages are still reachable or needed.
3. Consolidate duplicate legacy RLS policies only after that inventory.
4. Review GraphQL/direct SELECT exposure table by table.
5. Review remaining high-impact SECURITY DEFINER RPCs by category.
6. Clean duplicate legacy indexes after query usage is confirmed.
7. Leave extension-managed PostGIS objects alone unless there is a tested migration plan.
