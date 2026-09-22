-- Release marketplace listings that a buyer reserved but did not pay for.
-- Stripe Checkout is expired by the server cron before this RPC is called.

alter table public.market_orders
  add column if not exists reservation_expires_at timestamptz;

update public.market_orders
set reservation_expires_at = created_at + interval '30 minutes'
where reservation_expires_at is null;

alter table public.market_orders
  alter column reservation_expires_at set default (now() + interval '30 minutes'),
  alter column reservation_expires_at set not null;

create index if not exists market_orders_unpaid_reservation_expiry_idx
  on public.market_orders (reservation_expires_at)
  where status = 'awaiting_payment';

create or replace function public.expire_unpaid_marketplace_reservation(
  p_market_order_id uuid,
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
    or v_order.status <> 'awaiting_payment'
    or v_order.reservation_expires_at > now()
  then
    return false;
  end if;

  select * into v_payment
  from public.connection_payments
  where connection_id = v_order.connection_id
  for update;

  if found then
    -- Never release a listing once Stripe may be moving or holding money.
    if v_payment.status not in ('not_started','checkout_created','failed','cancelled')
      or v_payment.stripe_payment_intent_id is not null
      or v_payment.stripe_charge_id is not null
    then
      return false;
    end if;

    -- A Checkout Session must be inspected and, when open, expired through
    -- Stripe before database state can be removed.
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
    'market-reservation-expired:' || v_order.id::text || ':' || v_order.buyer_id::text,
    'Marketplace reservation expired',
    'The 30-minute payment window ended, so this item is available to other buyers again.',
    null,
    v_order.request_id,
    null,
    null,
    null
  );

  perform public.push_notification(
    v_order.seller_id,
    'market_order',
    'market-reservation-expired:' || v_order.id::text || ':' || v_order.seller_id::text,
    'Your listing is available again',
    'The buyer did not pay within 30 minutes, so Aspire released the reservation automatically.',
    null,
    v_order.request_id,
    null,
    null,
    null
  );

  -- Both protected-order and payment rows cascade from the connection. Keeping
  -- an unpaid connection would retain the one-order-per-listing uniqueness lock.
  delete from public.connections where id = v_order.connection_id;

  update public.requests
  set status = 'open', updated_at = now()
  where id = v_order.request_id
    and status = 'matched';

  return true;
end;
$function$;

revoke all on function public.expire_unpaid_marketplace_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.expire_unpaid_marketplace_reservation(uuid, text)
  to service_role;

comment on column public.market_orders.reservation_expires_at is
  'Unpaid marketplace reservation deadline. The server expires any open Stripe Checkout before releasing the listing.';

