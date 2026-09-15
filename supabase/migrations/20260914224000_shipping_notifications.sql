-- Surface meaningful carrier movement through Aspire's existing notification center.
-- Only milestone/exception states notify participants; label setup and rate churn stay quiet.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'request_response','connection_chosen','connection_confirmed','connection_completed','connection_cancelled','message','circle_mutual',
    'delivery_offer','delivery_counter','delivery_matched','delivery_status','delivery_cancelled','shipping_status'
  ));

create or replace function public.notify_market_shipping_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_title text;
  v_body text;
  v_actor uuid := auth.uid();
begin
  if old.shipping_status is not distinct from new.shipping_status then return new; end if;
  if new.fulfillment_method <> 'shipping' then return new; end if;
  if new.shipping_status not in ('in_transit','delivered','exception') then return new; end if;

  if new.shipping_status = 'in_transit' then
    v_title := 'Package is in transit';
    v_body := coalesce(new.shipping_carrier || ' is moving your package.', 'Carrier is moving your package.');
  elsif new.shipping_status = 'delivered' then
    v_title := 'Carrier marked package delivered';
    v_body := 'Open the protected order to verify receipt before any seller payout is released.';
  else
    v_title := 'Shipping needs attention';
    v_body := 'The carrier reported an exception or return. Open the order and use the Resolution Center if the issue cannot be resolved.';
  end if;

  foreach v_user in array array[new.buyer_id,new.seller_id] loop
    if v_user is not null and v_user is distinct from v_actor then
      insert into public.notifications(
        user_id,kind,actor_id,request_id,connection_id,event_key,title,body
      ) values (
        v_user,
        'shipping_status',
        v_actor,
        new.request_id,
        new.connection_id,
        'shipping-status:'||new.id::text||':'||new.shipping_status||':'||v_user::text,
        v_title,
        v_body
      )
      on conflict (user_id,event_key) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_market_shipping_change() from public;

drop trigger if exists notify_market_shipping_after_change on public.market_orders;
create trigger notify_market_shipping_after_change
after update of shipping_status on public.market_orders
for each row execute function public.notify_market_shipping_change();
