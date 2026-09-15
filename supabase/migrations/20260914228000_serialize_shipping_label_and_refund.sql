-- Serialize instant marketplace refunds against carrier-label purchases.
-- Both claims lock connection_payments first and market_orders second so exactly one
-- external-money path may win. A refund must never race a Shippo label purchase.

create or replace function public.claim_market_shipping_label_purchase(
  p_order_id uuid,
  p_expected_rate_id text
)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection_id uuid;
  v_payment public.connection_payments;
  v_order public.market_orders;
  v_now timestamptz := now();
begin
  select connection_id into v_connection_id
  from public.market_orders
  where id = p_order_id;
  if v_connection_id is null then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;

  -- Match refund/release lock order: payment first, market order second.
  select * into v_payment
  from public.connection_payments
  where connection_id = v_connection_id
  for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  select * into v_order
  from public.market_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if v_order.connection_id <> v_payment.connection_id then raise exception 'ORDER_PAYMENT_MISMATCH'; end if;

  if v_order.fulfillment_method <> 'shipping' then raise exception 'NOT_SHIPPING_ORDER'; end if;
  if v_order.status not in ('paid','handoff_confirmed') then raise exception 'PAYMENT_NOT_SECURED'; end if;
  if v_order.shipping_rate_id is null or v_order.shipping_rate_id <> p_expected_rate_id then raise exception 'SHIPPING_RATE_MISMATCH'; end if;
  if v_order.shipping_status not in ('rates_ready','label_failed') then raise exception 'LABEL_IN_PROGRESS'; end if;
  if v_order.shipping_transaction_id is not null
     or v_order.shipping_label_url is not null
     or v_order.shipping_tracking_number is not null then
    raise exception 'LABEL_ALREADY_COMMITTED';
  end if;

  if v_payment.status <> 'secured' or v_payment.stripe_transfer_id is not null then
    raise exception 'PAYMENT_NOT_SECURED';
  end if;
  if v_payment.release_claimed_at is not null then
    raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
  end if;
  -- Do not age out a refund claim here. A crashed process may have completed Stripe's
  -- refund but failed before local finalization, so any surviving claim requires review.
  if v_payment.refund_claimed_at is not null then
    raise exception 'REFUND_IN_PROGRESS';
  end if;

  update public.market_orders
  set shipping_status = 'label_purchasing',
      shipping_last_event_at = v_now,
      updated_at = v_now
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- Replace the generic refund claim with a shipping-aware version. Non-marketplace and
-- pre-label marketplace refunds keep their existing behavior.
create or replace function public.claim_connection_payment_refund(
  p_payment_id uuid,
  p_resolution_case_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
  v_order public.market_orders;
  v_claimed_at timestamptz;
  v_open_case_id uuid;
begin
  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  -- Lock a marketplace order after the payment, matching the label-purchase claim.
  select * into v_order
  from public.market_orders
  where connection_id = v_payment.connection_id
  for update;

  if v_payment.status = 'refunded' then
    return coalesce(v_payment.refund_claimed_at, v_payment.refunded_at, now());
  end if;
  if v_payment.status = 'released' or v_payment.stripe_transfer_id is not null then
    raise exception 'PAYOUT_ALREADY_RELEASED';
  end if;
  if v_payment.status <> 'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;

  -- Once a carrier-label purchase has started, an instant refund can no longer safely
  -- assume Aspire has not incurred a Shippo charge. Route the case to Resolution Center.
  if v_order.id is not null
     and v_order.fulfillment_method = 'shipping'
     and (
       v_order.shipping_status in ('label_purchasing','label_purchased','in_transit','delivered','exception')
       or v_order.shipping_transaction_id is not null
       or v_order.shipping_label_url is not null
       or v_order.shipping_tracking_number is not null
     ) then
    raise exception 'SHIPPING_REFUND_REQUIRES_RESOLUTION';
  end if;

  if v_payment.release_claimed_at is not null then
    if v_payment.release_claimed_at > now() - interval '5 minutes' then
      raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
    end if;
    update public.connection_payments
    set release_claimed_at = null, updated_at = now()
    where id = v_payment.id
      and status = 'secured'
      and release_claimed_at = v_payment.release_claimed_at;
  end if;

  select crc.id into v_open_case_id
  from public.connection_resolution_cases crc
  where crc.connection_id = v_payment.connection_id
    and crc.status in ('submitted','under_review')
  order by crc.created_at desc
  limit 1;

  if v_open_case_id is not null
     and (p_resolution_case_id is null or p_resolution_case_id <> v_open_case_id) then
    raise exception 'RESOLUTION_CASE_OPEN';
  end if;
  if p_resolution_case_id is not null and p_resolution_case_id is distinct from v_open_case_id then
    raise exception 'RESOLUTION_CASE_NOT_OPEN';
  end if;

  if exists (
    select 1
    from public.market_orders mo
    join public.market_disputes md on md.market_order_id = mo.id
    where mo.connection_id = v_payment.connection_id
      and md.status in ('open','under_review')
  ) then raise exception 'MARKET_DISPUTE_OPEN'; end if;

  if v_payment.refund_claimed_at is not null
     and v_payment.refund_claimed_at > now() - interval '5 minutes' then
    return v_payment.refund_claimed_at;
  end if;

  v_claimed_at := now();
  update public.connection_payments
  set refund_claimed_at = v_claimed_at, updated_at = v_claimed_at
  where id = v_payment.id;
  return v_claimed_at;
end;
$$;

revoke all on function public.claim_market_shipping_label_purchase(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_market_shipping_label_purchase(uuid,text) to service_role;

revoke all on function public.claim_connection_payment_refund(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_connection_payment_refund(uuid,uuid) to service_role;
