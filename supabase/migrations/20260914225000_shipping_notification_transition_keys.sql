-- Make shipping alerts correspond to real carrier transitions rather than one notification
-- per lifetime status. A package may recover from an exception and later encounter a new
-- exception; that second incident should be visible, while duplicate webhook retries for
-- an unchanged status remain silent because the trigger only runs meaningful transitions.

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
  v_transition_key text;
begin
  if old.shipping_status is not distinct from new.shipping_status then return new; end if;
  if new.fulfillment_method <> 'shipping' then return new; end if;
  if new.status in ('refunded','cancelled') then return new; end if;
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

  -- shipping_last_event_at is written with each accepted status transition. Including it in
  -- the key allows a genuine later recurrence (exception -> transit -> exception) while the
  -- status-change trigger itself suppresses retries that do not change state.
  v_transition_key := coalesce(new.shipping_last_event_at::text, new.updated_at::text, now()::text);

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
        left('shipping-status:'||new.id::text||':'||new.shipping_status||':'||v_user::text||':'||v_transition_key, 220),
        v_title,
        v_body
      )
      on conflict (user_id,event_key) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_market_shipping_change() from public, anon;
