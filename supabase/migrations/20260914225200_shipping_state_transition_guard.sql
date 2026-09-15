-- Final database-level guard for carrier shipping lifecycle monotonicity.
-- Application webhooks already ignore stale events, but service-role writes and future routes
-- must not be able to move a protected shipment backwards after carrier movement.

create or replace function public.guard_market_order_shipping_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_status text;
begin
  if old.shipping_status is not distinct from new.shipping_status then
    return new;
  end if;
  if old.fulfillment_method <> 'shipping' and new.fulfillment_method <> 'shipping' then
    return new;
  end if;

  -- Closed carrier states are terminal from Aspire's fulfillment perspective.
  if old.shipping_status = 'cancelled' and new.shipping_status <> 'cancelled' then
    raise exception 'SHIPPING_CANCELLED_IS_TERMINAL';
  end if;
  if old.shipping_status = 'delivered' and new.shipping_status <> 'delivered' then
    raise exception 'SHIPPING_DELIVERED_IS_TERMINAL';
  end if;

  -- Once the carrier has physically moved the package, stale pre-transit events must not
  -- recreate quote/label states. Exception may recover to in_transit or delivered.
  if old.shipping_status = 'in_transit'
     and new.shipping_status in ('not_started','rates_ready','label_purchasing','label_failed','label_purchased') then
    raise exception 'SHIPPING_STATUS_CANNOT_MOVE_BACKWARD';
  end if;
  if old.shipping_status = 'exception'
     and new.shipping_status in ('not_started','rates_ready','label_purchasing','label_purchased') then
    raise exception 'SHIPPING_STATUS_CANNOT_MOVE_BACKWARD';
  end if;

  select p.status into v_payment_status
  from public.connection_payments p
  where p.connection_id = new.connection_id;

  -- After checkout starts, shipping may fail/recover, but it can never return to editable
  -- quote setup states. This complements guard_market_order_shipping_terms().
  if v_payment_status is not null
     and v_payment_status not in ('not_started','failed')
     and old.shipping_status not in ('not_started','rates_ready')
     and new.shipping_status in ('not_started','rates_ready') then
    raise exception 'SHIPPING_STATUS_LOCKED_AFTER_CHECKOUT';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_market_order_shipping_status_transition() from public;

drop trigger if exists trg_guard_market_order_shipping_status_transition on public.market_orders;
create trigger trg_guard_market_order_shipping_status_transition
before update of shipping_status on public.market_orders
for each row execute function public.guard_market_order_shipping_status_transition();
