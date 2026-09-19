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
