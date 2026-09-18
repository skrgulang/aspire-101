-- Provide a browser-safe marketplace dispute read path independent of direct market_orders access.

create or replace function public.get_my_market_disputes(p_order_ids uuid[] default null)
returns table (
  id uuid,
  market_order_id uuid,
  opened_by uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.market_order_id,
    d.opened_by,
    d.reason,
    d.details,
    d.status,
    d.created_at,
    d.resolved_at
  from public.market_disputes d
  join public.market_orders o on o.id = d.market_order_id
  where auth.uid() is not null
    and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
    and (p_order_ids is null or d.market_order_id = any(p_order_ids))
  order by d.created_at desc;
$$;

revoke all on function public.get_my_market_disputes(uuid[]) from public, anon;
grant execute on function public.get_my_market_disputes(uuid[]) to authenticated, service_role;
