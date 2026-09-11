-- Follow-up hardening for the production Resolution Center.
-- Trigger helpers are not client RPCs, RLS auth lookups are initplan-friendly,
-- and new foreign-key access paths receive covering indexes.

revoke all on function public.notify_resolution_case_insert() from public, anon, authenticated;
revoke all on function public.notify_resolution_case_status_change() from public, anon, authenticated;

create index if not exists connection_resolution_cases_request_idx
  on public.connection_resolution_cases(request_id);
create index if not exists connection_resolution_cases_against_user_idx
  on public.connection_resolution_cases(against_user_id);
create index if not exists connection_resolution_cases_reviewed_by_idx
  on public.connection_resolution_cases(reviewed_by);
create index if not exists connection_resolution_responses_connection_idx
  on public.connection_resolution_responses(connection_id);
create index if not exists connection_resolution_responses_author_idx
  on public.connection_resolution_responses(author_id);
create index if not exists connection_no_show_connection_idx
  on public.connection_no_show_incidents(connection_id);
create index if not exists connection_no_show_confirmed_by_idx
  on public.connection_no_show_incidents(confirmed_by);

drop policy if exists "participants or moderators read resolution cases" on public.connection_resolution_cases;
create policy "participants or moderators read resolution cases"
on public.connection_resolution_cases for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_resolution_cases.connection_id
      and (select auth.uid()) in (c.requester_id, c.responder_id)
  )
  or exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role in ('moderator','admin')
  )
);

drop policy if exists "participants or moderators read resolution responses" on public.connection_resolution_responses;
create policy "participants or moderators read resolution responses"
on public.connection_resolution_responses for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_resolution_responses.connection_id
      and (select auth.uid()) in (c.requester_id, c.responder_id)
  )
  or exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role in ('moderator','admin')
  )
);

drop policy if exists "moderators read no show incidents" on public.connection_no_show_incidents;
create policy "moderators read no show incidents"
on public.connection_no_show_incidents for select to authenticated using (
  exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role in ('moderator','admin')
  )
);
