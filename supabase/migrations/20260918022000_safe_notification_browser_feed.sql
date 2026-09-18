-- Provide a browser-safe notification feed so realtime table SELECT can be retired.

create or replace function public.get_my_notifications(p_limit integer default 40)
returns table (
  id bigint,
  kind text,
  connection_id uuid,
  title text,
  body text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.kind,
    n.connection_id,
    n.title,
    n.body,
    n.read_at,
    n.created_at
  from public.notifications n
  where auth.uid() is not null
    and n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

revoke all on function public.get_my_notifications(integer) from public, anon;
grant execute on function public.get_my_notifications(integer) to authenticated, service_role;
