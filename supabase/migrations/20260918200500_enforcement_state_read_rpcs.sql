-- Replace direct browser reads of enforcement state with narrow RPCs.

create or replace function public.get_my_enforcement_state()
returns table(
  state text,
  reason text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.state,
    u.reason,
    u.expires_at
  from public.user_enforcement_states u
  where auth.uid() is not null
    and u.user_id = auth.uid()
    and (u.expires_at is null or u.expires_at > now())
  limit 1;
$$;

create or replace function public.moderator_fetch_enforcement_states(
  p_user_ids uuid[]
)
returns table(
  user_id uuid,
  state text,
  reason text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.user_id,
    u.state,
    u.reason,
    u.expires_at
  from public.user_enforcement_states u
  where public.is_moderator()
    and coalesce(array_length(p_user_ids,1),0) between 1 and 200
    and u.user_id = any(p_user_ids);
$$;

revoke all on function public.get_my_enforcement_state() from public, anon;
grant execute on function public.get_my_enforcement_state() to authenticated, service_role;

revoke all on function public.moderator_fetch_enforcement_states(uuid[]) from public, anon;
grant execute on function public.moderator_fetch_enforcement_states(uuid[]) to authenticated, service_role;
