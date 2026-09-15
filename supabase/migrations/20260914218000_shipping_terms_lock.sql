-- Harden carrier-shipping terms at the database layer.
-- Once checkout has started, addresses / shipment / selected rate terms become immutable.
-- Label, tracking, and shipping lifecycle fields remain writable after payment so fulfillment can continue.

alter table public.market_orders
  drop constraint if exists market_orders_shipping_rate_shape_check;

alter table public.market_orders
  add constraint market_orders_shipping_rate_shape_check
  check (
    shipping_rate_id is null
    or (
      shipping_rate_cents is not null
      and shipping_rate_cents > 0
      and shipping_currency is not null
      and char_length(shipping_currency) = 3
    )
  );

create or replace function public.guard_market_order_shipping_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_status text;
begin
  if old.fulfillment_method <> 'shipping' and new.fulfillment_method <> 'shipping' then
    return new;
  end if;

  select p.status into v_payment_status
  from public.connection_payments p
  where p.connection_id = new.connection_id;

  if v_payment_status is null or v_payment_status in ('not_started','failed') then
    return new;
  end if;

  if old.shipping_from_address_id is distinct from new.shipping_from_address_id
     or old.shipping_to_address_id is distinct from new.shipping_to_address_id
     or old.shipping_shipment_id is distinct from new.shipping_shipment_id
     or old.shipping_rate_id is distinct from new.shipping_rate_id
     or old.shipping_rate_cents is distinct from new.shipping_rate_cents
     or old.shipping_currency is distinct from new.shipping_currency
     or old.shipping_carrier is distinct from new.shipping_carrier
     or old.shipping_service is distinct from new.shipping_service
     or old.fulfillment_method is distinct from new.fulfillment_method
  then
    raise exception 'SHIPPING_TERMS_LOCKED_AFTER_CHECKOUT';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_market_order_shipping_terms() from public;

drop trigger if exists trg_guard_market_order_shipping_terms on public.market_orders;
create trigger trg_guard_market_order_shipping_terms
before update on public.market_orders
for each row execute function public.guard_market_order_shipping_terms();
