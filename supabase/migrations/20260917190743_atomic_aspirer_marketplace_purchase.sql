create or replace function public.purchase_marketplace_with_aspirer_delivery(
  p_request_id uuid,
  p_delivery_address jsonb,
  p_delivery_instructions text default null,
  p_compensation_mode text default 'discuss',
  p_requested_amount_cents integer default null,
  p_pickup_area text default 'Seller pickup area',
  p_dropoff_area text default null
)
returns table(
  connection_id uuid,
  market_order_id uuid,
  delivery_request_id uuid,
  delivery_link_id uuid
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_connection_id uuid;
  v_order public.market_orders;
  v_listing public.requests;
  v_delivery_request public.requests;
  v_link public.market_delivery_links;
  v_pickup text;
  v_dropoff text;
  v_reward text;
  v_kind text;
  v_payment_method text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_post_request() then raise exception 'POST_NOT_ALLOWED'; end if;
  if p_compensation_mode not in ('free','fixed','discuss') then raise exception 'INVALID_COMPENSATION_MODE'; end if;
  if p_compensation_mode = 'fixed' and coalesce(p_requested_amount_cents, 0) <= 0 then raise exception 'DELIVERY_AMOUNT_REQUIRED'; end if;

  v_pickup := left(coalesce(nullif(btrim(p_pickup_area), ''), 'Seller pickup area'), 120);
  v_dropoff := left(coalesce(nullif(btrim(p_dropoff_area), ''), ''), 120);
  if v_dropoff = '' then raise exception 'DELIVERY_DROPOFF_AREA_REQUIRED'; end if;

  select * into v_listing from public.requests where id = p_request_id;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;

  -- purchase_marketplace_listing locks and validates the listing. Because this call,
  -- the address write, delivery-request insert, and link insert all occur in this
  -- function's transaction, any later failure rolls the reservation back too.
  v_connection_id := public.purchase_marketplace_listing(
    p_request_id,
    'aspirer_delivery',
    'aspire',
    null
  );

  perform public.set_market_order_delivery_address(
    v_connection_id,
    p_delivery_address,
    p_delivery_instructions
  );

  select * into v_order
  from public.market_orders
  where connection_id = v_connection_id;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if v_order.buyer_id <> v_user then raise exception 'NOT_BUYER'; end if;

  v_reward := case
    when p_compensation_mode = 'free' then 'Free'
    when p_compensation_mode = 'fixed' then '$' || trim(to_char(p_requested_amount_cents / 100.0, 'FM999999990.00'))
    else 'Negotiable'
  end;
  v_kind := case when p_compensation_mode = 'free' then 'community' else 'paid_help' end;
  v_payment_method := case when p_compensation_mode = 'free' then 'none' else 'aspire' end;

  insert into public.requests (
    poster_id,
    kind,
    category,
    title,
    details,
    campus_id,
    latitude,
    longitude,
    meeting_label,
    amount_cents,
    currency,
    payment_method,
    quantity,
    language_code
  ) values (
    v_user,
    v_kind,
    'Pickup / errand',
    left('Deliver ' || v_listing.title, 180),
    'Linked marketplace delivery for “' || v_listing.title || '”. Pickup area: ' || v_pickup ||
      '. Drop-off area: ' || v_dropoff || '. Reward: ' || v_reward ||
      '. Exact delivery address stays private until a helper is chosen.',
    v_listing.campus_id,
    null,
    null,
    left(v_pickup || ' → ' || v_dropoff, 240),
    case when p_compensation_mode = 'fixed' then p_requested_amount_cents else null end,
    'USD',
    v_payment_method,
    1,
    coalesce(v_listing.language_code, 'en')
  ) returning * into v_delivery_request;

  select * into v_link
  from public.link_market_delivery_request(
    v_order.id,
    v_delivery_request.id,
    p_compensation_mode,
    case when p_compensation_mode = 'fixed' then 'aspire' else 'none' end,
    case when p_compensation_mode = 'fixed' then p_requested_amount_cents else null end,
    v_pickup,
    v_dropoff
  );

  return query select v_connection_id, v_order.id, v_delivery_request.id, v_link.id;
end;
$function$;

revoke all on function public.purchase_marketplace_with_aspirer_delivery(uuid,jsonb,text,text,integer,text,text) from public, anon;
grant execute on function public.purchase_marketplace_with_aspirer_delivery(uuid,jsonb,text,text,integer,text,text) to authenticated;
grant execute on function public.purchase_marketplace_with_aspirer_delivery(uuid,jsonb,text,text,integer,text,text) to service_role;

comment on function public.purchase_marketplace_with_aspirer_delivery(uuid,jsonb,text,text,integer,text,text)
is 'Atomically reserves an Aspirer-delivery marketplace listing, stores the buyer private address, creates the public general-area delivery request, and links it to the order.';
