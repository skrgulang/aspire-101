-- Restore the Saved Requests surface now that bookmark saving is active again.
-- Each authenticated user can only read/write/delete their own saved rows.

alter table public.saved_requests enable row level security;

drop policy if exists "users read own saved requests" on public.saved_requests;
create policy "users read own saved requests"
on public.saved_requests for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users save requests for themselves" on public.saved_requests;
create policy "users save requests for themselves"
on public.saved_requests for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own saved requests" on public.saved_requests;
create policy "users update own saved requests"
on public.saved_requests for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users remove own saved requests" on public.saved_requests;
create policy "users remove own saved requests"
on public.saved_requests for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.saved_requests from anon;
grant select, insert, update, delete on public.saved_requests to authenticated;
