-- Enforce carrier-shipping lifecycle at the RPC boundary, not only in the UI.
-- Shipping orders cannot be marked handed off before a label exists, and buyers cannot
-- confirm receipt until the carrier status is delivered.

create or replace function public.market_mark_handoff(p_connection_id uuid)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
  p public.connection_payments;
begin
  select * into o from public.market_orders where connection_id = p_connection_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if auth.uid() is null or auth.uid() <> o.seller_id then raise exception 'NOT_SELLER'; end if;

  select * into p from public.connection_payments where id = o.payment_id;
  if p.id is null or p.status <> 'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;
  if o.status = 'disputed' then raise exception 'ORDER_DISPUTED'; end if;
  if o.status in ('released','refunded','cancelled') then raise exception 'ORDER_CLOSED'; end if;

  if o.fulfillment_method = 'shipping' then
    if o.shipping_rate_id is null or o.shipping_rate_cents is null then
      raise exception 'SHIPPING_RATE_REQUIRED';
    end if;
    if o.shipping_transaction_id is null
       or o.shipping_label_url is null
       or coalesce(o.shipping_status, '') not in ('label_purchased','in_transit','delivered') then
      raise exception 'SHIPPING_LABEL_REQUIRED';
    end if;
  end if;

  update public.market_orders
  set seller_handed_off_at = coalesce(seller_handed_off_at, now()),
      status = case when buyer_received_at is not null then 'release_ready' else 'handoff_confirmed' end,
      updated_at = now()
  where id = o.id returning * into o;

  insert into public.market_order_events(market_order_id, actor_id, event_type, payload)
  values (
    o.id,
    auth.uid(),
    case when o.fulfillment_method = 'shipping' then 'seller_marked_shipped' else 'seller_handed_off' end,
    case when o.fulfillment_method = 'shipping'
      then jsonb_build_object('shipping_status', o.shipping_status, 'tracking_number', o.shipping_tracking_number)
      else '{}'::jsonb
    end
  );
  return o;
end;
$$;

create or replace function public.market_confirm_receipt(p_connection_id uuid)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_orders where connection_id = p_connection_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if auth.uid() is null or auth.uid() <> o.buyer_id then raise exception 'NOT_BUYER'; end if;
  if o.seller_handed_off_at is null then raise exception 'HANDOFF_NOT_CONFIRMED'; end if;
  if o.status = 'disputed' then raise exception 'ORDER_DISPUTED'; end if;
  if o.status in ('released','refunded','cancelled') then raise exception 'ORDER_CLOSED'; end if;

  if o.fulfillment_method = 'shipping' and coalesce(o.shipping_status, '') <> 'delivered' then
    raise exception 'CARRIER_DELIVERY_NOT_CONFIRMED';
  end if;

  update public.market_orders
  set buyer_received_at = coalesce(buyer_received_at, now()),
      status = 'release_ready',
      updated_at = now()
  where id = o.id returning * into o;

  insert into public.market_order_events(market_order_id, actor_id, event_type, payload)
  values (
    o.id,
    auth.uid(),
    'buyer_confirmed_received',
    case when o.fulfillment_method = 'shipping'
      then jsonb_build_object('shipping_status', o.shipping_status, 'tracking_number', o.shipping_tracking_number)
      else '{}'::jsonb
    end
  );
  return o;
end;
$$;

revoke all on function public.market_mark_handoff(uuid) from public, anon;
revoke all on function public.market_confirm_receipt(uuid) from public, anon;
grant execute on function public.market_mark_handoff(uuid) to authenticated, service_role;
grant execute on function public.market_confirm_receipt(uuid) to authenticated, service_role;
