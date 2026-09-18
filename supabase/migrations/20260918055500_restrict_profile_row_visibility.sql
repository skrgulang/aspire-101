-- Stop generic signed-in profile enumeration while preserving the browser flows
-- that need basic safe-column profile data for self, request responses, and connections.
-- Public/campus profile viewing remains available through get_public_student_profile(...),
-- which applies profile_visibility rules and returns a narrower projection.

create or replace function public.can_view_profile_row(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      auth.uid() = p_target_user_id
      or public.is_moderator()
      or exists (
        select 1
        from public.connections c
        where (c.requester_id = auth.uid() and c.responder_id = p_target_user_id)
           or (c.responder_id = auth.uid() and c.requester_id = p_target_user_id)
      )
      or exists (
        select 1
        from public.request_responses rr
        join public.requests r on r.id = rr.request_id
        where (r.poster_id = auth.uid() and rr.responder_id = p_target_user_id)
           or (rr.responder_id = auth.uid() and r.poster_id = p_target_user_id)
      )
    );
$$;

revoke all on function public.can_view_profile_row(uuid) from PUBLIC, anon;
grant execute on function public.can_view_profile_row(uuid) to authenticated, service_role;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (public.can_view_profile_row(id));
