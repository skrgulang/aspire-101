-- Retire the unused Saved Requests browser surface.
-- Current product code has no saved_requests client path and the table is empty.
-- Keep service-role access for rollback/audit without leaving a writable JSON surface exposed.

revoke all privileges on table public.saved_requests from anon, authenticated;

drop policy if exists "users remove own saved requests" on public.saved_requests;
drop policy if exists "users save requests for themselves" on public.saved_requests;
drop policy if exists "users read own saved requests" on public.saved_requests;
drop policy if exists "users update own saved requests" on public.saved_requests;
