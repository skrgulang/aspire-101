-- Keep cancelled/refunded reservations in history while allowing the listing to
-- be matched again. Only one non-closed order may reserve a listing at a time.
alter table public.market_orders
  drop constraint if exists market_orders_request_id_key;

create unique index if not exists market_orders_one_active_request_idx
  on public.market_orders(request_id)
  where status in (
    'awaiting_payment', 'payment_processing', 'paid', 'handoff_confirmed',
    'release_ready', 'disputed', 'off_platform'
  );

-- The legacy RPC returned boolean and deleted the connection. Replace its
-- signature so callers receive the preserved, cancelled order record.
drop function if exists public.cancel_unpaid_marketplace_reservation(uuid);

create or replace function public.cancel_unpaid_marketplace_reservation(p_connection_id uuid)
returns public.market_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.market_orders;
  v_payment public.connection_payments;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order
  from public.market_orders
  where connection_id = p_connection_id
  for update;

  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if auth.uid() not in (v_order.buyer_id, v_order.seller_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;
  if v_order.status <> 'awaiting_payment' then
    raise exception 'UNPAID_CANCELLATION_NOT_AVAILABLE';
  end if;
  if exists (
    select 1
    from public.market_delivery_links
    where market_order_id = v_order.id
  ) then
    raise exception 'FULFILLMENT_ALREADY_STARTED';
  end if;

  select * into v_payment
  from public.connection_payments
  where connection_id = p_connection_id
  for update;

  if v_payment.id is not null
     and v_payment.status in ('checkout_created', 'processing', 'secured', 'released', 'disputed') then
    raise exception 'PAYMENT_PROCESSING';
  end if;

  if v_payment.id is not null then
    update public.connection_payments
    set status = 'cancelled', updated_at = now()
    where id = v_payment.id
      and status in ('not_started', 'failed', 'cancelled');
  end if;

  update public.market_orders
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where id = v_order.id
  returning * into v_order;

  update public.connections
  set status = 'cancelled', updated_at = now()
  where id = p_connection_id
    and status in ('pending', 'confirmed', 'active');

  update public.requests
  set status = 'open', updated_at = now()
  where id = v_order.request_id
    and status in ('matched', 'in_progress');

  insert into public.market_order_events(market_order_id, actor_id, event_type, payload)
  values (v_order.id, auth.uid(), 'reservation_cancelled', jsonb_build_object('payment_secured', false));

  return v_order;
end;
$$;

-- Called only by the verified server route after Stripe accepted the refund.
-- This makes the mirrored order/payment/connection/listing update atomic.
create or replace function public.finalize_marketplace_refund(
  p_connection_id uuid,
  p_refund_id text,
  p_actor_id uuid
)
returns public.market_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.market_orders;
  v_payment public.connection_payments;
begin
  select * into v_order
  from public.market_orders
  where connection_id = p_connection_id
  for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;

  select * into v_payment
  from public.connection_payments
  where connection_id = p_connection_id
  for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  update public.connection_payments
  set status = 'refunded',
      stripe_refund_id = p_refund_id,
      refunded_at = coalesce(refunded_at, now()),
      failure_reason = null,
      updated_at = now()
  where id = v_payment.id
    and status in ('secured', 'refunded');

  update public.market_orders
  set status = 'refunded', refunded_at = coalesce(refunded_at, now()), updated_at = now()
  where id = v_order.id
  returning * into v_order;

  update public.connections
  set status = 'cancelled', updated_at = now()
  where id = p_connection_id
    and status in ('pending', 'confirmed', 'active');

  update public.requests
  set status = 'open', updated_at = now()
  where id = v_order.request_id
    and status in ('matched', 'in_progress');

  insert into public.market_order_events(market_order_id, actor_id, event_type, payload)
  values (
    v_order.id,
    p_actor_id,
    'refund_created',
    jsonb_build_object('stripe_refund_id', p_refund_id)
  );

  return v_order;
end;
$$;

revoke all on function public.cancel_unpaid_marketplace_reservation(uuid) from public, anon;
grant execute on function public.cancel_unpaid_marketplace_reservation(uuid) to authenticated, service_role;

revoke all on function public.finalize_marketplace_refund(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.finalize_marketplace_refund(uuid, text, uuid) to service_role;
