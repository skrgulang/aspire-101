-- Define the account-enforcement helper used by Flexible Fulfillment RPCs.
-- Existing enforcement state already treats missing/expired enforcement as active.

create or replace function public.can_user_interact(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.effective_user_enforcement(p_user_id), 'active') = 'active';
$$;

revoke all on function public.can_user_interact(uuid) from public, anon, authenticated;
grant execute on function public.can_user_interact(uuid) to service_role;
