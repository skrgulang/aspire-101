-- Moderator-only audit history for Trust & Safety operations.

create or replace function public.moderator_fetch_action_history(p_limit integer default 150)
returns table(
  id uuid,
  moderator_id uuid,
  moderator_email text,
  action text,
  target_user_id uuid,
  request_id uuid,
  request_title text,
  report_id uuid,
  note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;

  return query
  select
    a.id,
    a.moderator_id,
    u.email::text as moderator_email,
    a.action,
    a.target_user_id,
    a.request_id,
    r.title as request_title,
    a.report_id,
    a.note,
    a.created_at
  from public.moderation_actions a
  left join auth.users u on u.id = a.moderator_id
  left join public.requests r on r.id = a.request_id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit,150),500));
end;
$$;

revoke all on function public.moderator_fetch_action_history(integer) from public;
revoke all on function public.moderator_fetch_action_history(integer) from anon;
grant execute on function public.moderator_fetch_action_history(integer) to authenticated;
