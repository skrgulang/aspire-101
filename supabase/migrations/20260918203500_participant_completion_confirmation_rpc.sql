-- Browser clients only need completion confirmations for connections they participate in.

create or replace function public.get_completion_confirmations_for_my_connections(p_connection_ids uuid[])
returns table(
  connection_id uuid,
  user_id uuid,
  confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cc.connection_id,
    cc.user_id,
    cc.confirmed_at
  from public.connection_completion_confirmations cc
  join public.connections c on c.id = cc.connection_id
  where auth.uid() is not null
    and coalesce(array_length(p_connection_ids,1),0) between 1 and 200
    and cc.connection_id = any(p_connection_ids)
    and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
  order by cc.confirmed_at asc;
$$;

revoke all on function public.get_completion_confirmations_for_my_connections(uuid[]) from public, anon;
grant execute on function public.get_completion_confirmations_for_my_connections(uuid[]) to authenticated, service_role;
