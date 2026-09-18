-- Expose exact live coordinates through a participant-scoped RPC instead of a raw table read.
-- Direct table SELECT stays in place temporarily until the client migration reaches production.

create or replace function public.get_my_active_connection_locations(p_connection_ids uuid[])
returns table(
  connection_id uuid,
  user_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  expires_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.connection_id,
    l.user_id,
    l.latitude,
    l.longitude,
    l.accuracy_meters,
    l.expires_at,
    l.updated_at
  from public.connection_live_locations l
  join public.connections c on c.id = l.connection_id
  where auth.uid() is not null
    and l.expires_at > now()
    and c.status in ('confirmed','active')
    and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
    and l.connection_id = any(coalesce(p_connection_ids, '{}'::uuid[]))
    and not exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_id = c.requester_id and ub.blocked_id = c.responder_id)
         or (ub.blocker_id = c.responder_id and ub.blocked_id = c.requester_id)
    )
  order by l.updated_at desc
  limit 200;
$$;

revoke all on function public.get_my_active_connection_locations(uuid[]) from PUBLIC, anon;
grant execute on function public.get_my_active_connection_locations(uuid[]) to authenticated, service_role;
