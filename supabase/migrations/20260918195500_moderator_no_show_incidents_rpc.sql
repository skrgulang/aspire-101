-- Keep no-show incident history behind the existing MFA-aware moderator boundary.
-- Direct authenticated table SELECT remains temporarily during the staged client rollout.

create or replace function public.moderator_fetch_no_show_incidents(p_user_ids uuid[], p_limit integer default 200)
returns table(
  id uuid,
  case_id uuid,
  connection_id uuid,
  user_id uuid,
  confirmed_by uuid,
  note text,
  created_at timestamptz
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
    n.id,
    n.case_id,
    n.connection_id,
    n.user_id,
    n.confirmed_by,
    n.note,
    n.created_at
  from public.connection_no_show_incidents n
  where n.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.moderator_fetch_no_show_incidents(uuid[],integer) from PUBLIC, anon;
grant execute on function public.moderator_fetch_no_show_incidents(uuid[],integer) to authenticated, service_role;
