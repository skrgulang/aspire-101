-- Add browser-safe marketplace order and transition RPCs before revoking legacy access.

create or replace function public.get_my_market_orders(p_connection_ids uuid[] default null)
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
  shipping_paid_by text
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
    o.shipping_paid_by
  from public.market_orders o
  where auth.uid() is not null
    and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
    and (p_connection_ids is null or o.connection_id = any(p_connection_ids))
  order by o.created_at desc;
$$;

revoke all on function public.get_my_market_orders(uuid[]) from public, anon;
grant execute on function public.get_my_market_orders(uuid[]) to authenticated, service_role;

create or replace function public.market_mark_handoff_safe(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_mark_handoff(p_connection_id);
  return o.status;
end;
$$;

create or replace function public.market_confirm_receipt_safe(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_confirm_receipt(p_connection_id);
  return o.status;
end;
$$;

create or replace function public.market_open_dispute_safe(p_connection_id uuid, p_reason text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.market_disputes;
begin
  select * into d from public.market_open_dispute(p_connection_id, p_reason, p_details);
  return d.id;
end;
$$;

revoke all on function public.market_mark_handoff_safe(uuid) from public, anon;
revoke all on function public.market_confirm_receipt_safe(uuid) from public, anon;
revoke all on function public.market_open_dispute_safe(uuid,text,text) from public, anon;
grant execute on function public.market_mark_handoff_safe(uuid) to authenticated, service_role;
grant execute on function public.market_confirm_receipt_safe(uuid) to authenticated, service_role;
grant execute on function public.market_open_dispute_safe(uuid,text,text) to authenticated, service_role;
