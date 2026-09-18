-- Keep support/contact details private while preserving a safe public ideas board.

create or replace function public.get_public_support_feedback(p_limit integer default 12)
returns table (
  id uuid,
  type text,
  subject text,
  details text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.type, s.subject, s.details, s.created_at
  from public.support_feedback s
  where s.approved = true
    and coalesce(s.archived, false) = false
    and s.type in ('feature', 'bug', 'feedback')
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

create or replace function public.get_my_support_feedback(p_limit integer default 50)
returns table (
  id uuid,
  type text,
  subject text,
  details text,
  approved boolean,
  archived boolean,
  reason text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.type, s.subject, s.details, s.approved, s.archived, s.reason, s.created_at
  from public.support_feedback s
  where auth.uid() is not null
    and s.created_by = auth.uid()
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.moderator_fetch_support_feedback(p_limit integer default 200)
returns setof public.support_feedback
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (public.is_moderator() or public.is_admin()) then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  return query
  select s.*
  from public.support_feedback s
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.get_public_support_feedback(integer) from public;
revoke all on function public.get_my_support_feedback(integer) from public;
revoke all on function public.moderator_fetch_support_feedback(integer) from public;

grant execute on function public.get_public_support_feedback(integer) to anon, authenticated, service_role;
grant execute on function public.get_my_support_feedback(integer) to authenticated, service_role;
grant execute on function public.moderator_fetch_support_feedback(integer) to authenticated, service_role;

revoke select on table public.support_feedback from anon, authenticated;
