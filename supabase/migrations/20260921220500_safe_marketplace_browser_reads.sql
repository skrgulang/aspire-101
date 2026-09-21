-- Safe browser read boundaries for marketplace fee preview and price proposals.
-- Keep hardened tables private while exposing only participant/public configuration fields.

create or replace function public.get_active_fee_policy(
  p_campus_id uuid default null
)
returns table (
  campus_id uuid,
  requester_fee_bps integer,
  requester_fee_fixed_cents integer,
  requester_fee_min_cents integer,
  requester_fee_max_cents integer,
  provider_fee_bps integer,
  minimum_paid_order_cents integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    fp.campus_id,
    fp.requester_fee_bps,
    fp.requester_fee_fixed_cents,
    fp.requester_fee_min_cents,
    fp.requester_fee_max_cents,
    fp.provider_fee_bps,
    fp.minimum_paid_order_cents
  from public.fee_policies fp
  where fp.active = true
    and (fp.campus_id = p_campus_id or fp.campus_id is null)
  order by (fp.campus_id is not null) desc, fp.updated_at desc
  limit 1;
$$;

revoke all on function public.get_active_fee_policy(uuid) from public, anon, authenticated;
grant execute on function public.get_active_fee_policy(uuid) to authenticated;
grant execute on function public.get_active_fee_policy(uuid) to service_role;

create or replace function public.get_my_market_price_proposals(
  p_order_ids uuid[] default null
)
returns table (
  id uuid,
  market_order_id uuid,
  connection_id uuid,
  proposed_by uuid,
  amount_cents integer,
  currency text,
  status text,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    p.id,
    p.market_order_id,
    p.connection_id,
    p.proposed_by,
    p.amount_cents,
    p.currency,
    p.status,
    p.responded_by,
    p.responded_at,
    p.created_at,
    p.updated_at
  from public.market_price_proposals p
  join public.market_orders o on o.id = p.market_order_id
  where auth.uid() is not null
    and auth.uid() in (o.buyer_id, o.seller_id)
    and p.status = 'pending'
    and (p_order_ids is null or p.market_order_id = any(p_order_ids))
  order by p.created_at desc;
$$;

revoke all on function public.get_my_market_price_proposals(uuid[]) from public, anon, authenticated;
grant execute on function public.get_my_market_price_proposals(uuid[]) to authenticated;
grant execute on function public.get_my_market_price_proposals(uuid[]) to service_role;
