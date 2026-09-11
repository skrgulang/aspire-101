-- Connection lifecycle state for Connected → Complete → Review / Circle → Archive.
create or replace function public.get_connection_lifecycle_states()
returns table (
  connection_id uuid,
  viewer_completed boolean,
  other_completed boolean,
  completion_count integer,
  viewer_circle_choice boolean,
  mutual_circle boolean,
  blocked_between boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      c.*,
      case when auth.uid() = c.requester_id then c.responder_id else c.requester_id end as other_user_id
    from public.connections c
    where auth.uid() is not null
      and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
  )
  select
    m.id as connection_id,
    exists (
      select 1 from public.connection_completion_confirmations cc
      where cc.connection_id = m.id and cc.user_id = auth.uid()
    ) as viewer_completed,
    exists (
      select 1 from public.connection_completion_confirmations cc
      where cc.connection_id = m.id and cc.user_id = m.other_user_id
    ) as other_completed,
    (
      select count(*)::integer
      from public.connection_completion_confirmations cc
      where cc.connection_id = m.id
        and cc.user_id in (m.requester_id, m.responder_id)
    ) as completion_count,
    (
      select ccc.keep_in_circle
      from public.connection_circle_choices ccc
      where ccc.connection_id = m.id and ccc.user_id = auth.uid()
      limit 1
    ) as viewer_circle_choice,
    (
      exists (
        select 1 from public.connection_circle_choices a
        where a.connection_id = m.id and a.user_id = m.requester_id and a.keep_in_circle = true
      )
      and exists (
        select 1 from public.connection_circle_choices b
        where b.connection_id = m.id and b.user_id = m.responder_id and b.keep_in_circle = true
      )
    ) as mutual_circle,
    exists (
      select 1 from public.user_blocks ub
      where (ub.blocker_id = m.requester_id and ub.blocked_id = m.responder_id)
         or (ub.blocker_id = m.responder_id and ub.blocked_id = m.requester_id)
    ) as blocked_between
  from mine m
  order by m.created_at desc;
$$;

revoke all on function public.get_connection_lifecycle_states() from public;
revoke all on function public.get_connection_lifecycle_states() from anon;
grant execute on function public.get_connection_lifecycle_states() to authenticated;

-- A block now also prevents the blocked pair from viewing each other's public profile.
create or replace function public.get_public_profile(p_target_user_id uuid)
returns table (
  user_id uuid,
  can_view boolean,
  visibility text,
  display_name text,
  school text,
  avatar_url text,
  bio text,
  major text,
  graduation_year smallint,
  interests text[],
  completed_count bigint,
  joined_at timestamptz,
  school_verified boolean,
  is_connection boolean,
  same_campus boolean,
  owner_view boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_target public.profiles%rowtype;
  v_preferences public.user_preferences%rowtype;
  v_owner boolean := false;
  v_connection boolean := false;
  v_same_campus boolean := false;
  v_blocked boolean := false;
  v_can_view boolean := false;
  v_visibility text := 'connections';
begin
  if v_viewer_id is null then
    raise exception 'Authentication required';
  end if;

  select p.* into v_target
  from public.profiles p
  where p.id = p_target_user_id;

  if not found then
    return;
  end if;

  select up.* into v_preferences
  from public.user_preferences up
  where up.user_id = p_target_user_id;

  v_owner := v_viewer_id = p_target_user_id;
  v_visibility := coalesce(v_preferences.profile_visibility, 'connections');

  select exists (
    select 1
    from public.connections c
    where c.status in ('confirmed', 'active', 'completed')
      and c.requester_confirmed = true
      and c.responder_confirmed = true
      and (
        (c.requester_id = v_viewer_id and c.responder_id = p_target_user_id)
        or
        (c.requester_id = p_target_user_id and c.responder_id = v_viewer_id)
      )
  ) into v_connection;

  select exists (
    select 1
    from public.profiles viewer
    where viewer.id = v_viewer_id
      and viewer.home_campus_id is not null
      and v_target.home_campus_id is not null
      and viewer.home_campus_id = v_target.home_campus_id
  ) into v_same_campus;

  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = v_viewer_id and ub.blocked_id = p_target_user_id)
       or (ub.blocker_id = p_target_user_id and ub.blocked_id = v_viewer_id)
  ) into v_blocked;

  v_can_view := v_owner or (
    not v_blocked and (
      (v_visibility = 'connections' and v_connection)
      or (v_visibility = 'campus' and v_same_campus)
    )
  );

  return query
  select
    p_target_user_id,
    v_can_view,
    v_visibility,
    case when v_can_view then coalesce(nullif(trim(v_target.display_name), ''), nullif(trim(v_target.full_name), ''), nullif(trim(v_target.name), ''), 'Aspire student') else null end,
    case when v_can_view then v_target.school else null end,
    case when v_can_view then coalesce(v_target.avatar_url, v_target.image_url) else null end,
    case when v_can_view then v_target.bio else null end,
    case when v_can_view and coalesce(v_preferences.show_major, true) then v_target.major else null end,
    case when v_can_view and coalesce(v_preferences.show_graduation_year, true) then v_target.graduation_year else null end,
    case when v_can_view and coalesce(v_preferences.show_interests, true) then coalesce(v_target.interests, '{}'::text[]) else null end,
    case when v_can_view and coalesce(v_preferences.show_completed, true) then (
      select count(*)::bigint from public.requests r where r.poster_id = p_target_user_id and r.status = 'completed'
    ) else null end,
    case when v_can_view and coalesce(v_preferences.show_joined, true) then v_target.created_at else null end,
    case when v_can_view then exists (
      select 1 from public.school_verifications sv where sv.user_id = p_target_user_id and sv.status = 'verified'
    ) else false end,
    v_connection,
    v_same_campus,
    v_owner;
end;
$$;

revoke all on function public.get_public_profile(uuid) from public;
revoke all on function public.get_public_profile(uuid) from anon;
grant execute on function public.get_public_profile(uuid) to authenticated;
