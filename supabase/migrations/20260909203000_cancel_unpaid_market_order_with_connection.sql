create or replace function public.sync_cancelled_connection_market_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.market_orders mo
    set status = 'cancelled',
        cancelled_at = coalesce(mo.cancelled_at, now()),
        updated_at = now()
    where mo.connection_id = new.id
      and mo.status = 'awaiting_payment'
      and not exists (
        select 1
        from public.connection_payments cp
        where cp.connection_id = new.id
          and cp.status in ('processing','secured','released')
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_cancelled_connection_market_order on public.connections;
create trigger trg_sync_cancelled_connection_market_order
after update of status on public.connections
for each row
execute function public.sync_cancelled_connection_market_order();

update public.market_orders mo
set status = 'cancelled',
    cancelled_at = coalesce(mo.cancelled_at, now()),
    updated_at = now()
from public.connections c
where mo.connection_id = c.id
  and c.status = 'cancelled'
  and mo.status = 'awaiting_payment'
  and not exists (
    select 1
    from public.connection_payments cp
    where cp.connection_id = c.id
      and cp.status in ('processing','secured','released')
  );
