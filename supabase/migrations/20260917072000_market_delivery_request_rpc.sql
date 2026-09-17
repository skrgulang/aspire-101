create or replace function public.create_market_delivery_request_for_order(
  p_market_order_id uuid,
  p_compensation_mode text,
  p_protection_mode text,
  p_requested_amount_cents integer,
  p_pickup_area text,
  p_dropoff_area text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.market_orders;
  v_listing public.requests;
  v_existing public.market_delivery_links;
  v_request public.requests;
  v_pickup text := left(btrim(coalesce(p_pickup_area, '')), 180);
  v_dropoff text := left(btrim(coalesce(p_dropoff_area, '')), 180);
  v_kind text;
  v_amount integer;
  v_reward_label text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_post_request(auth.uid()) then raise exception 'POST_NOT_ALLOWED'; end if;
  if p_compensation_mode not in ('free','fixed','discuss') then raise exception 'INVALID_COMPENSATION_MODE'; end if;
  if p_protection_mode not in ('none','aspire','off_platform') then raise exception 'INVALID_PROTECTION_MODE'; end if;
  if p_compensation_mode = 'free' and p_protection_mode <> 'none' then raise exception 'FREE_DELIVERY_HAS_NO_PAYMENT'; end if;
  if p_compensation_mode = 'fixed' and coalesce(p_requested_amount_cents, 0) <= 0 then raise exception 'DELIVERY_AMOUNT_REQUIRED'; end if;
  if p_compensation_mode = 'fixed' and p_protection_mode <> 'aspire' then raise exception 'FIXED_DELIVERY_REQUIRES_ASPIRE'; end if;
  if p_compensation_mode = 'discuss' and p_protection_mode <> 'none' then raise exception 'DISCUSS_PAYMENT_AFTER_MATCH'; end if;
  if char_length(v_pickup) < 2 or char_length(v_dropoff) < 2 then raise exception 'PUBLIC_AREAS_REQUIRED'; end if;

  select * into v_order from public.market_orders where id = p_market_order_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if v_order.buyer_id <> auth.uid() then raise exception 'NOT_BUYER'; end if;
  if v_order.fulfillment_method <> 'aspirer_delivery' then raise exception 'ASPIRER_DELIVERY_REQUIRED'; end if;
  if v_order.status not in ('awaiting_payment','payment_processing','paid') then raise exception 'MARKET_ORDER_CLOSED'; end if;

  select * into v_existing from public.market_delivery_links where market_order_id = v_order.id and status = 'active' limit 1;
  if found then return v_existing.delivery_request_id; end if;

  select * into v_listing from public.requests where id = v_order.request_id;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;

  v_kind := case when p_compensation_mode = 'fixed' then 'paid_help' else 'community' end;
  v_amount := case when p_compensation_mode = 'fixed' then p_requested_amount_cents else null end;
  v_reward_label := case
    when p_compensation_mode = 'free' then 'Free'
    when p_compensation_mode = 'fixed' then '$' || trim(to_char(p_requested_amount_cents / 100.0, 'FM999999990.00'))
    else 'Negotiable'
  end;

  insert into public.requests(
    poster_id, kind, category, title, details, campus_id,
    latitude, longitude, meeting_label, amount_cents, currency, payment_method,
    language_code
  ) values (
    auth.uid(),
    v_kind,
    'Pickup / errand',
    left('Deliver ' || v_listing.title, 180),
    'Linked marketplace delivery for “' || v_listing.title || '”. Pickup area: ' || v_pickup || '. Drop-off area: ' || v_dropoff || '. Reward: ' || v_reward_label || '. Exact delivery address stays private until a helper is chosen.',
    v_listing.campus_id,
    null,
    null,
    left(v_pickup || ' → ' || v_dropoff, 240),
    v_amount,
    'USD',
    case when p_compensation_mode = 'fixed' then 'aspire' else 'none' end,
    coalesce(v_listing.language_code, 'en')
  ) returning * into v_request;

  insert into public.market_delivery_links(
    market_order_id, delivery_request_id, buyer_id, compensation_mode, protection_mode,
    requested_amount_cents, pickup_area, dropoff_area
  ) values (
    v_order.id,
    v_request.id,
    auth.uid(),
    p_compensation_mode,
    p_protection_mode,
    case when p_compensation_mode = 'fixed' then p_requested_amount_cents else null end,
    v_pickup,
    v_dropoff
  );

  update public.market_orders
  set aspirer_delivery_status = 'looking_for_aspirer',
      aspirer_delivery_reward_mode = case
        when p_compensation_mode = 'free' then 'free'
        when p_compensation_mode = 'fixed' then 'fixed'
        else 'negotiable'
      end,
      aspirer_delivery_reward_cents = case when p_compensation_mode = 'fixed' then p_requested_amount_cents else null end,
      updated_at = now()
  where id = v_order.id;

  return v_request.id;
end;
$$;

revoke all on function public.create_market_delivery_request_for_order(uuid,text,text,integer,text,text) from public;
grant execute on function public.create_market_delivery_request_for_order(uuid,text,text,integer,text,text) to authenticated;

create or replace function public.cancel_unpaid_marketplace_reservation(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.market_orders;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order
  from public.market_orders
  where connection_id = p_connection_id
  for update;

  if not found then return false; end if;
  if v_order.buyer_id <> auth.uid() then raise exception 'NOT_BUYER'; end if;
  if v_order.status <> 'awaiting_payment' or v_order.payment_id is not null then return false; end if;
  if exists (select 1 from public.connection_payments cp where cp.connection_id = p_connection_id) then return false; end if;
  if exists (select 1 from public.market_delivery_links mdl where mdl.market_order_id = v_order.id) then return false; end if;

  delete from public.connections where id = p_connection_id;
  update public.requests set status = 'open', updated_at = now()
  where id = v_order.request_id and status = 'matched';
  return true;
end;
$$;

revoke all on function public.cancel_unpaid_marketplace_reservation(uuid) from public;
grant execute on function public.cancel_unpaid_marketplace_reservation(uuid) to authenticated;
