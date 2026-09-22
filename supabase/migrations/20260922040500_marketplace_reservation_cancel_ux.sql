-- Expose the reservation deadline to order participants and allow the server to
-- atomically release an unpaid reservation after any Stripe Checkout is closed.

drop function if exists public.get_my_market_orders_v2(uuid[]);

create function public.get_my_market_orders_v2(p_connection_ids uuid[] default null)
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
  reservation_expires_at timestamptz,
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
as $function$
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
    o.reservation_expires_at,
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
$function$;

revoke all on function public.get_my_market_orders_v2(uuid[]) from public, anon;
grant execute on function public.get_my_market_orders_v2(uuid[]) to authenticated, service_role;

create or replace function public.cancel_unpaid_marketplace_reservation_server(
  p_market_order_id uuid,
  p_buyer_id uuid,
  p_expected_checkout_session_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_order public.market_orders%rowtype;
  v_payment public.connection_payments%rowtype;
begin
  select * into v_order
  from public.market_orders
  where id = p_market_order_id
  for update;

  if not found
    or v_order.buyer_id <> p_buyer_id
    or v_order.status <> 'awaiting_payment'
  then
    return false;
  end if;

  if exists (
    select 1 from public.market_delivery_links
    where market_order_id = v_order.id
  ) then
    return false;
  end if;

  select * into v_payment
  from public.connection_payments
  where connection_id = v_order.connection_id
  for update;

  if found then
    if v_payment.status not in ('not_started','checkout_created','failed','cancelled')
      or v_payment.stripe_payment_intent_id is not null
      or v_payment.stripe_charge_id is not null
    then
      return false;
    end if;

    if v_payment.stripe_checkout_session_id is not null
      and p_expected_checkout_session_id is distinct from v_payment.stripe_checkout_session_id
    then
      return false;
    end if;
  elsif p_expected_checkout_session_id is not null then
    return false;
  end if;

  delete from public.notifications
  where connection_id = v_order.connection_id
    and event_key in (
      'market-payment-due:' || v_order.connection_id::text,
      'market-awaiting-payment:' || v_order.connection_id::text
    );

  perform public.push_notification(
    v_order.buyer_id,
    'market_order',
    'market-reservation-cancelled:' || v_order.id::text || ':' || v_order.buyer_id::text,
    'Reservation cancelled',
    'You cancelled the unpaid reservation. The listing is available to other buyers again.',
    null,
    v_order.request_id,
    null,
    null,
    null
  );

  perform public.push_notification(
    v_order.seller_id,
    'market_order',
    'market-reservation-cancelled:' || v_order.id::text || ':' || v_order.seller_id::text,
    'Your listing is available again',
    'The buyer cancelled the unpaid reservation, so other buyers can purchase the item.',
    null,
    v_order.request_id,
    null,
    null,
    null
  );

  delete from public.connections where id = v_order.connection_id;

  update public.requests
  set status = 'open', updated_at = now()
  where id = v_order.request_id
    and status = 'matched';

  return true;
end;
$function$;

revoke all on function public.cancel_unpaid_marketplace_reservation_server(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_unpaid_marketplace_reservation_server(uuid, uuid, text)
  to service_role;
