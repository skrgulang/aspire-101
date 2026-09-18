-- Add participant-safe marketplace order read fields needed by Seller Delivery.
-- This is additive so the currently deployed client can keep using get_my_market_orders during rollout.

create or replace function public.get_my_market_orders_v2(p_connection_ids uuid[] default null)
returns table (
  id uuid,
  connection_id uuid,
  request_id uuid,
  buyer_id uuid,
  seller_id uuid,
  listing_intent text,
  fulfillment_method text,
  currency text,
  agreed_amount_cents integer,
  status text,
  seller_handed_off_at timestamptz,
  buyer_received_at timestamptz,
  shipping_carrier text,
  shipping_service text,
  shipping_rate_id text,
  shipping_rate_cents integer,
  shipping_currency text,
  shipping_label_url text,
  shipping_tracking_number text,
  shipping_tracking_url text,
  shipping_status text,
  shipping_paid_by text,
  seller_delivery_fee_cents integer,
  seller_delivery_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.connection_id,
    o.request_id,
    o.buyer_id,
    o.seller_id,
    o.listing_intent,
    o.fulfillment_method,
    o.currency,
    o.agreed_amount_cents,
    o.status,
    o.seller_handed_off_at,
    o.buyer_received_at,
    o.shipping_carrier,
    o.shipping_service,
    o.shipping_rate_id,
    o.shipping_rate_cents,
    o.shipping_currency,
    case when auth.uid() = o.seller_id then o.shipping_label_url else null end,
    o.shipping_tracking_number,
    o.shipping_tracking_url,
    o.shipping_status,
    o.shipping_paid_by,
    o.seller_delivery_fee_cents,
    o.seller_delivery_status
  from public.market_orders o
  where auth.uid() is not null
    and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
    and (p_connection_ids is null or o.connection_id = any(p_connection_ids))
  order by o.created_at desc;
$$;

revoke all on function public.get_my_market_orders_v2(uuid[]) from public, anon;
grant execute on function public.get_my_market_orders_v2(uuid[]) to authenticated, service_role;
