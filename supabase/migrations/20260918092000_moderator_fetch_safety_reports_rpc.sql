-- Provide a narrow moderator read path for safety reports.
-- Direct authenticated table SELECT remains retired.

create or replace function public.moderator_fetch_safety_reports(p_limit integer default 200)
returns table(
  id uuid,
  reporter_id uuid,
  target_user_id uuid,
  request_id uuid,
  connection_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;

  return query
  select
    s.id,
    s.reporter_id,
    s.target_user_id,
    s.request_id,
    s.connection_id,
    s.reason,
    s.details,
    s.status,
    s.created_at,
    s.reviewed_at
  from public.safety_reports s
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.moderator_fetch_safety_reports(integer) from public, anon;
grant execute on function public.moderator_fetch_safety_reports(integer) to authenticated, service_role;
