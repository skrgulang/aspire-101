-- Freeze carrier lifecycle once Aspire has financially closed or disputed the order.
-- Webhook/application code already ignores these states, but the database must also
-- reject future service-role writes so a late carrier event cannot mutate a closed order.

create or replace function public.guard_market_order_shipping_financial_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.shipping_status is not distinct from new.shipping_status then
    return new;
  end if;

  if old.fulfillment_method is distinct from 'shipping'
     and new.fulfillment_method is distinct from 'shipping' then
    return new;
  end if;

  if old.status in ('disputed','refunded','cancelled','released') then
    raise exception 'SHIPPING_ORDER_FINANCIALLY_CLOSED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_market_order_shipping_financial_close() from public;

drop trigger if exists trg_guard_market_order_shipping_financial_close on public.market_orders;
create trigger trg_guard_market_order_shipping_financial_close
before update of shipping_status on public.market_orders
for each row execute function public.guard_market_order_shipping_financial_close();
