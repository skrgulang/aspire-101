-- Keep join applications server-side.
-- Current product code does not access this table from browser sessions; legacy application intake used a trusted server path.

revoke all privileges on table public.join_requests from anon, authenticated;

drop policy if exists "users can submit join request" on public.join_requests;
