-- Freeze the buyer-approved carrier quote once checkout has started.
-- After a payment row reaches checkout_created or later, application/service code
-- may update shipping progress, but it may not swap the shipment, rate, price,
-- currency, or who pays for shipping underneath the payment snapshot.

create or replace function public.guard_paid_market_shipping_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_status text;
begin
  if old.fulfillment_method <> 'shipping' then
    return new;
  end if;

  select cp.status
  into v_payment_status
  from public.connection_payments cp
  where cp.connection_id = old.connection_id;

  if v_payment_status in (
    'checkout_created',
    'processing',
    'secured',
    'released',
    'refunded',
    'disputed'
  ) and (
       new.shipping_shipment_id is distinct from old.shipping_shipment_id
    or new.shipping_rate_id is distinct from old.shipping_rate_id
    or new.shipping_rate_cents is distinct from old.shipping_rate_cents
    or new.shipping_currency is distinct from old.shipping_currency
    or new.shipping_paid_by is distinct from old.shipping_paid_by
  ) then
    raise exception 'SHIPPING_PAYMENT_SNAPSHOT_LOCKED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_paid_market_shipping_snapshot()
  from public, anon, authenticated;

drop trigger if exists guard_paid_market_shipping_snapshot_tg on public.market_orders;

create trigger guard_paid_market_shipping_snapshot_tg
before update of
  shipping_shipment_id,
  shipping_rate_id,
  shipping_rate_cents,
  shipping_currency,
  shipping_paid_by
on public.market_orders
for each row execute function public.guard_paid_market_shipping_snapshot();


-- Serialize shipping-label purchase against refund/dispute/review holds. The label
-- transition locks the payment row before the external Shippo charge is allowed.
create or replace function public.guard_market_shipping_label_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
begin
  if new.shipping_status <> 'label_purchasing'
     or new.shipping_status is not distinct from old.shipping_status
  then
    return new;
  end if;

  if new.fulfillment_method <> 'shipping' then
    raise exception 'NOT_SHIPPING_ORDER';
  end if;

  select *
  into v_payment
  from public.connection_payments
  where connection_id = new.connection_id
  for update;

  if not found or v_payment.status <> 'secured' then
    raise exception 'PAYMENT_NOT_SECURED';
  end if;

  if v_payment.refund_claimed_at is not null then
    if v_payment.refund_claimed_at > now() - interval '5 minutes' then
      raise exception 'REFUND_IN_PROGRESS';
    end if;
    update public.connection_payments
    set refund_claimed_at = null,
        updated_at = now()
    where id = v_payment.id
      and status = 'secured'
      and refund_claimed_at = v_payment.refund_claimed_at;
  end if;

  if v_payment.release_claimed_at is not null then
    if v_payment.release_claimed_at > now() - interval '5 minutes' then
      raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
    end if;
    update public.connection_payments
    set release_claimed_at = null,
        updated_at = now()
    where id = v_payment.id
      and status = 'secured'
      and release_claimed_at = v_payment.release_claimed_at;
  end if;

  if exists (
    select 1
    from public.connections cn
    where cn.id = new.connection_id
      and cn.status = 'cancelled'
  ) then
    raise exception 'CONNECTION_CANCELLED';
  end if;

  if exists (
    select 1
    from public.connection_resolution_cases crc
    where crc.connection_id = new.connection_id
      and crc.status in ('submitted','under_review')
  ) then
    raise exception 'PAYOUT_HOLD_OPEN';
  end if;

  if exists (
    select 1
    from public.payment_refund_requests prr
    where prr.payment_id = v_payment.id
      and prr.status in ('open','under_review','approved')
  ) then
    raise exception 'PAYOUT_HOLD_OPEN';
  end if;

  if exists (
    select 1
    from public.market_disputes md
    where md.market_order_id = new.id
      and md.status in ('open','under_review')
  ) then
    raise exception 'PAYOUT_HOLD_OPEN';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_market_shipping_label_purchase()
  from public, anon, authenticated;

drop trigger if exists guard_market_shipping_label_purchase_tg on public.market_orders;

create trigger guard_market_shipping_label_purchase_tg
before update of shipping_status
on public.market_orders
for each row execute function public.guard_market_shipping_label_purchase();

-- Instant marketplace cancellation must not race a Shippo label purchase. Reviewed
-- Resolution Center refunds may still proceed after shipping starts because staff can
-- reconcile the carrier cost as part of the case.
create or replace function public.claim_connection_payment_refund(
  p_payment_id uuid,
  p_resolution_case_id uuid default null
)
returns timestamp with time zone
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
  v_claimed_at timestamptz;
  v_open_case_id uuid;
begin
  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status = 'refunded' then
    return coalesce(v_payment.refund_claimed_at, v_payment.refunded_at, now());
  end if;
  if v_payment.status = 'released' or v_payment.stripe_transfer_id is not null then
    raise exception 'PAYOUT_ALREADY_RELEASED';
  end if;
  if v_payment.status <> 'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;

  if p_resolution_case_id is null and exists (
    select 1
    from public.market_orders mo
    where mo.connection_id = v_payment.connection_id
      and mo.fulfillment_method = 'shipping'
      and mo.shipping_status in (
        'label_purchasing',
        'label_purchased',
        'in_transit',
        'delivered',
        'exception'
      )
  ) then
    raise exception 'SHIPPING_ALREADY_STARTED';
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

revoke all on function public.claim_connection_payment_refund(uuid,uuid)
  from public, anon, authenticated;


-- Account deletion must stay blocked while either side of a payment has an
-- unresolved refund review, including released payments whose status alone no
-- longer looks unsettled.
create or replace function public.account_has_open_refund_review(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payment_refund_requests prr
    join public.connection_payments cp on cp.id = prr.payment_id
    where prr.status in ('open','under_review','approved')
      and p_user_id in (cp.payer_id, cp.payee_id)
  );
$$;

revoke all on function public.account_has_open_refund_review(uuid)
  from public, anon, authenticated;
grant execute on function public.account_has_open_refund_review(uuid)
  to service_role;
