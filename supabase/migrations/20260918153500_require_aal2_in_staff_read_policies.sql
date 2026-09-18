-- Route remaining staff read exceptions through the AAL2-aware moderator helper.

drop policy if exists "moderators read no show incidents" on public.connection_no_show_incidents;
create policy "moderators read no show incidents"
on public.connection_no_show_incidents
for select
to authenticated
using (public.is_moderator());

drop policy if exists "participants or moderators read resolution cases" on public.connection_resolution_cases;
create policy "participants or moderators read resolution cases"
on public.connection_resolution_cases
for select
to authenticated
using (
  exists (
    select 1
    from public.connections c
    where c.id = connection_resolution_cases.connection_id
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  )
  or public.is_moderator()
);

drop policy if exists "participants or moderators read resolution responses" on public.connection_resolution_responses;
create policy "participants or moderators read resolution responses"
on public.connection_resolution_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.connections c
    where c.id = connection_resolution_responses.connection_id
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  )
  or public.is_moderator()
);
