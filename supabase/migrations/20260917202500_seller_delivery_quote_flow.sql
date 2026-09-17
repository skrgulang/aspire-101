-- Structured seller-delivery negotiation and protected address handling.
-- Buyer shares only a general area before the seller quotes/accepts delivery.
-- Exact address is stored privately only after the buyer accepts a quote and
-- becomes visible to the seller only after protected payment is complete.

alter table public.market_orders
  drop constraint if exists market_orders_fulfillment_method_check;

alter table public.market_orders
  add constraint market_orders_fulfillment_method_check
  check (fulfillment_method = any (array['campus_pickup','shipping','aspirer_delivery','seller_delivery']::text[]));

alter table public.market_orders
  add column if not exists seller_delivery_fee_cents integer,
  add column if not exists seller_delivery_status text not null default 'not_started',
  add column if not exists seller_delivery_last_event_at timestamptz;

alter table public.market_orders
  drop constraint if exists market_orders_seller_delivery_fee_cents_check;
alter table public.market_orders
  add constraint market_orders_seller_delivery_fee_cents_check
  check (seller_delivery_fee_cents is null or seller_delivery_fee_cents >= 0);

alter table public.market_orders
  drop constraint if exists market_orders_seller_delivery_status_check;
alter table public.market_orders
  add constraint market_orders_seller_delivery_status_check
  check (seller_delivery_status = any (array[
    'not_started','awaiting_payment','ready','out_for_delivery','delivered','completed','cancelled'
  ]::text[]));

create table if not exists public.market_seller_delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_area text not null,
  buyer_note text,
  status text not null default 'requested',
  delivery_cents integer,
  seller_note text,
  connection_id uuid references public.connections(id) on delete set null,
  market_order_id uuid references public.market_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quoted_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  constraint market_seller_delivery_quotes_request_buyer_key unique (request_id, buyer_id),
  constraint market_seller_delivery_quotes_status_check check (
    status = any (array['requested','quoted','accepted','declined','cancelled']::text[])
  ),
  constraint market_seller_delivery_quotes_delivery_cents_check check (
    delivery_cents is null or delivery_cents >= 0
  ),
  constraint market_seller_delivery_quotes_area_length_check check (char_length(buyer_area) between 1 and 180),
  constraint market_seller_delivery_quotes_buyer_note_length_check check (buyer_note is null or char_length(buyer_note) <= 500),
  constraint market_seller_delivery_quotes_seller_note_length_check check (seller_note is null or char_length(seller_note) <= 500)
);

create index if not exists market_seller_delivery_quotes_buyer_idx
  on public.market_seller_delivery_quotes (buyer_id, updated_at desc);
create index if not exists market_seller_delivery_quotes_seller_idx
  on public.market_seller_delivery_quotes (seller_id, updated_at desc);
create index if not exists market_seller_delivery_quotes_request_idx
  on public.market_seller_delivery_quotes (request_id);

alter table public.market_seller_delivery_quotes enable row level security;

drop policy if exists market_seller_delivery_quotes_participant_read on public.market_seller_delivery_quotes;
create policy market_seller_delivery_quotes_participant_read
on public.market_seller_delivery_quotes
for select
to authenticated
using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

-- Browser writes are intentionally RPC-only so status/amount transitions cannot be forged.
revoke insert, update, delete on public.market_seller_delivery_quotes from anon, authenticated;
grant select on public.market_seller_delivery_quotes to authenticated;

create table if not exists public.market_seller_delivery_private_addresses (
  market_order_id uuid primary key references public.market_orders(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  address jsonb not null,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_seller_delivery_private_instructions_length_check
    check (instructions is null or char_length(instructions) <= 500)
);

alter table public.market_seller_delivery_private_addresses enable row level security;

drop policy if exists market_seller_delivery_private_buyer_read on public.market_seller_delivery_private_addresses;
create policy market_seller_delivery_private_buyer_read
on public.market_seller_delivery_private_addresses
for select
to authenticated
using (buyer_id = auth.uid() or public.is_admin());

revoke insert, update, delete on public.market_seller_delivery_private_addresses from anon, authenticated;
grant select on public.market_seller_delivery_private_addresses to authenticated;

create or replace function public.ensure_market_order_for_connection()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.requests%rowtype;
  v_buyer uuid;
  v_seller uuid;
  v_amount integer;
  v_status text;
  v_fulfillment_method text;
  v_shipping_paid_by text;
  v_payment_choice text;
  v_seller_delivery_fee integer;
begin
  select * into r from public.requests where id = new.request_id;
  if not found or r.kind <> 'buy_sell' or r.market_intent is null then return new; end if;

  v_amount := coalesce(new.agreed_amount_cents, r.amount_cents, 0);
  if v_amount <= 0 then return new; end if;

  if r.market_intent = 'sell' then
    v_seller := r.poster_id;
    v_buyer := new.responder_id;
  else
    v_buyer := r.poster_id;
    v_seller := new.responder_id;
  end if;

  v_fulfillment_method := coalesce(new.agreed_terms->>'fulfillment_method', r.fulfillment_method, r.fulfillment_methods[1], 'campus_pickup');
  if v_fulfillment_method not in ('campus_pickup','shipping','aspirer_delivery','seller_delivery') then
    v_fulfillment_method := 'campus_pickup';
  end if;
  v_shipping_paid_by := nullif(new.agreed_terms->>'shipping_paid_by','');
  v_payment_choice := coalesce(new.payment_method, r.payment_method, 'none');
  v_status := case when v_payment_choice = 'aspire' then 'awaiting_payment' else 'off_platform' end;
  if v_fulfillment_method = 'seller_delivery' then
    v_seller_delivery_fee := greatest(coalesce((new.agreed_terms->>'seller_delivery_fee_cents')::integer, 0), 0);
  else
    v_seller_delivery_fee := null;
  end if;

  insert into public.market_orders (
    connection_id, request_id, buyer_id, seller_id, listing_intent,
    fulfillment_method, currency, agreed_amount_cents, status, shipping_paid_by, payment_choice,
    seller_delivery_fee_cents, seller_delivery_status, seller_delivery_last_event_at
  ) values (
    new.id, r.id, v_buyer, v_seller, r.market_intent,
    v_fulfillment_method, coalesce(r.currency, 'USD'), v_amount, v_status, v_shipping_paid_by, v_payment_choice,
    v_seller_delivery_fee,
    case when v_fulfillment_method='seller_delivery' then 'awaiting_payment' else 'not_started' end,
    case when v_fulfillment_method='seller_delivery' then now() else null end
  )
  on conflict (connection_id) do update set
    buyer_id = excluded.buyer_id,
    seller_id = excluded.seller_id,
    agreed_amount_cents = excluded.agreed_amount_cents,
    fulfillment_method = excluded.fulfillment_method,
    currency = excluded.currency,
    shipping_paid_by = excluded.shipping_paid_by,
    payment_choice = excluded.payment_choice,
    seller_delivery_fee_cents = excluded.seller_delivery_fee_cents,
    seller_delivery_status = case
      when excluded.fulfillment_method='seller_delivery' and public.market_orders.seller_delivery_status='not_started'
        then 'awaiting_payment'
      when excluded.fulfillment_method<>'seller_delivery' then 'not_started'
      else public.market_orders.seller_delivery_status
    end,
    seller_delivery_last_event_at = case
      when excluded.fulfillment_method='seller_delivery' then coalesce(public.market_orders.seller_delivery_last_event_at, now())
      else null
    end,
    updated_at = now();

  return new;
end;
$function$;

create or replace function public.request_market_seller_delivery(
  p_request_id uuid,
  p_buyer_area text,
  p_buyer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request public.requests%rowtype;
  v_buyer uuid := auth.uid();
  v_quote public.market_seller_delivery_quotes%rowtype;
  v_area text;
  v_note text;
begin
  if v_buyer is null then raise exception 'AUTH_REQUIRED'; end if;
  v_area := left(btrim(coalesce(p_buyer_area,'')), 180);
  v_note := nullif(left(btrim(coalesce(p_buyer_note,'')), 500), '');
  if v_area = '' then raise exception 'GENERAL_AREA_REQUIRED'; end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_request.kind <> 'buy_sell' or v_request.market_intent <> 'sell' then raise exception 'NOT_A_LISTING'; end if;
  if v_request.poster_id = v_buyer then raise exception 'CANNOT_BUY_OWN_LISTING'; end if;
  if v_request.status <> 'open' then raise exception 'LISTING_UNAVAILABLE'; end if;
  if v_request.moderation_status <> 'approved' then raise exception 'LISTING_NOT_APPROVED'; end if;
  if v_request.listing_expires_at is not null and v_request.listing_expires_at <= now() then raise exception 'LISTING_EXPIRED'; end if;
  if not ('seller_delivery' = any(coalesce(v_request.fulfillment_methods, array[]::text[]))) then
    raise exception 'SELLER_DELIVERY_NOT_OFFERED';
  end if;
  if v_request.seller_delivery_mode is null then raise exception 'SELLER_DELIVERY_NOT_CONFIGURED'; end if;
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id=v_buyer and ub.blocked_id=v_request.poster_id)
       or (ub.blocker_id=v_request.poster_id and ub.blocked_id=v_buyer)
  ) then raise exception 'LISTING_UNAVAILABLE'; end if;

  select * into v_quote
  from public.market_seller_delivery_quotes
  where request_id = p_request_id and buyer_id = v_buyer
  for update;

  if found and v_quote.status = 'accepted' then raise exception 'QUOTE_ALREADY_ACCEPTED'; end if;

  insert into public.market_seller_delivery_quotes (
    request_id, buyer_id, seller_id, buyer_area, buyer_note,
    status, delivery_cents, seller_note, quoted_at, accepted_at, declined_at
  ) values (
    p_request_id, v_buyer, v_request.poster_id, v_area, v_note,
    'requested', null, null, null, null, null
  )
  on conflict (request_id, buyer_id) do update set
    buyer_area = excluded.buyer_area,
    buyer_note = excluded.buyer_note,
    status = 'requested',
    delivery_cents = null,
    seller_note = null,
    quoted_at = null,
    declined_at = null,
    updated_at = now()
  returning * into v_quote;

  return v_quote.id;
end;
$function$;

grant execute on function public.request_market_seller_delivery(uuid,text,text) to authenticated;

create or replace function public.quote_market_seller_delivery(
  p_quote_id uuid,
  p_delivery_cents integer default null,
  p_seller_note text default null
)
returns public.market_seller_delivery_quotes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.market_seller_delivery_quotes%rowtype;
  v_request public.requests%rowtype;
  v_amount integer;
  v_note text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_quote from public.market_seller_delivery_quotes where id=p_quote_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.seller_id <> auth.uid() then raise exception 'NOT_SELLER'; end if;
  if v_quote.status not in ('requested','quoted') then raise exception 'QUOTE_NOT_EDITABLE'; end if;

  select * into v_request from public.requests where id=v_quote.request_id for update;
  if not found or v_request.status <> 'open' then raise exception 'LISTING_UNAVAILABLE'; end if;
  if not ('seller_delivery' = any(coalesce(v_request.fulfillment_methods,array[]::text[]))) then
    raise exception 'SELLER_DELIVERY_NOT_OFFERED';
  end if;

  if v_request.seller_delivery_mode = 'free' then
    v_amount := 0;
  elsif v_request.seller_delivery_mode = 'fixed' then
    v_amount := coalesce(v_request.seller_delivery_price_cents, 0);
  elsif v_request.seller_delivery_mode = 'negotiable' then
    if p_delivery_cents is null or p_delivery_cents < 0 then raise exception 'DELIVERY_QUOTE_REQUIRED'; end if;
    v_amount := p_delivery_cents;
  else
    raise exception 'SELLER_DELIVERY_NOT_CONFIGURED';
  end if;

  v_note := nullif(left(btrim(coalesce(p_seller_note,'')),500),'');

  update public.market_seller_delivery_quotes
  set status='quoted', delivery_cents=v_amount, seller_note=v_note,
      quoted_at=now(), declined_at=null, updated_at=now()
  where id=p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$function$;

grant execute on function public.quote_market_seller_delivery(uuid,integer,text) to authenticated;

create or replace function public.decline_market_seller_delivery(
  p_quote_id uuid,
  p_note text default null
)
returns public.market_seller_delivery_quotes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.market_seller_delivery_quotes%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_quote from public.market_seller_delivery_quotes where id=p_quote_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.seller_id <> auth.uid() then raise exception 'NOT_SELLER'; end if;
  if v_quote.status not in ('requested','quoted') then raise exception 'QUOTE_NOT_EDITABLE'; end if;

  update public.market_seller_delivery_quotes
  set status='declined', seller_note=nullif(left(btrim(coalesce(p_note,'')),500),''),
      declined_at=now(), updated_at=now()
  where id=p_quote_id
  returning * into v_quote;
  return v_quote;
end;
$function$;

grant execute on function public.decline_market_seller_delivery(uuid,text) to authenticated;

create or replace function public.cancel_market_seller_delivery_request(p_quote_id uuid)
returns public.market_seller_delivery_quotes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.market_seller_delivery_quotes%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_quote from public.market_seller_delivery_quotes where id=p_quote_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.buyer_id <> auth.uid() then raise exception 'NOT_BUYER'; end if;
  if v_quote.status not in ('requested','quoted','declined') then raise exception 'QUOTE_NOT_CANCELLABLE'; end if;

  update public.market_seller_delivery_quotes
  set status='cancelled', updated_at=now()
  where id=p_quote_id
  returning * into v_quote;
  return v_quote;
end;
$function$;

grant execute on function public.cancel_market_seller_delivery_request(uuid) to authenticated;

create or replace function public.accept_market_seller_delivery_quote(
  p_quote_id uuid,
  p_delivery_address jsonb,
  p_delivery_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.market_seller_delivery_quotes%rowtype;
  v_request public.requests%rowtype;
  v_connection_id uuid;
  v_order_id uuid;
  v_item_cents integer;
  v_delivery_cents integer;
  v_total_cents integer;
  v_street1 text;
  v_city text;
  v_state text;
  v_zip text;
  v_country text;
  v_address jsonb;
  v_instructions text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_quote from public.market_seller_delivery_quotes where id=p_quote_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.buyer_id <> auth.uid() then raise exception 'NOT_BUYER'; end if;
  if v_quote.status <> 'quoted' then raise exception 'QUOTE_NOT_READY'; end if;
  if v_quote.delivery_cents is null or v_quote.delivery_cents < 0 then raise exception 'INVALID_DELIVERY_QUOTE'; end if;

  select * into v_request from public.requests where id=v_quote.request_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_request.status <> 'open' then raise exception 'LISTING_UNAVAILABLE'; end if;
  if v_request.moderation_status <> 'approved' then raise exception 'LISTING_NOT_APPROVED'; end if;
  if v_request.poster_id <> v_quote.seller_id then raise exception 'SELLER_MISMATCH'; end if;
  if v_request.listing_expires_at is not null and v_request.listing_expires_at <= now() then raise exception 'LISTING_EXPIRED'; end if;
  if not ('seller_delivery' = any(coalesce(v_request.fulfillment_methods,array[]::text[]))) then
    raise exception 'SELLER_DELIVERY_NOT_OFFERED';
  end if;
  if exists (select 1 from public.connections where request_id=v_request.id and status <> 'cancelled') then
    raise exception 'LISTING_UNAVAILABLE';
  end if;

  v_street1 := btrim(coalesce(p_delivery_address->>'street1',''));
  v_city := btrim(coalesce(p_delivery_address->>'city',''));
  v_state := btrim(coalesce(p_delivery_address->>'state',''));
  v_zip := btrim(coalesce(p_delivery_address->>'zip',''));
  v_country := upper(btrim(coalesce(p_delivery_address->>'country','US')));
  if v_street1='' or v_city='' or v_state='' or v_zip='' or v_country='' then
    raise exception 'DELIVERY_ADDRESS_INCOMPLETE';
  end if;

  v_address := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(left(btrim(coalesce(p_delivery_address->>'name','')),120),''),
    'street1', left(v_street1,180),
    'street2', nullif(left(btrim(coalesce(p_delivery_address->>'street2','')),180),''),
    'city', left(v_city,100),
    'state', left(v_state,80),
    'zip', left(v_zip,24),
    'country', left(v_country,2)
  ));
  v_instructions := nullif(left(btrim(coalesce(p_delivery_instructions,'')),500),'');

  v_item_cents := coalesce(v_request.amount_cents,0);
  if v_item_cents <= 0 then raise exception 'LISTING_HAS_NO_PRICE'; end if;
  v_delivery_cents := v_quote.delivery_cents;
  v_total_cents := v_item_cents + v_delivery_cents;

  insert into public.connections (
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, agreed_terms, payment_method
  ) values (
    v_request.id, v_request.poster_id, v_quote.buyer_id, true, true,
    'confirmed', v_total_cents,
    jsonb_build_object(
      'category',v_request.category,
      'kind',v_request.kind,
      'source','marketplace_seller_delivery_quote',
      'protection','aspire_protected',
      'fulfillment_method','seller_delivery',
      'item_amount_cents',v_item_cents,
      'seller_delivery_fee_cents',v_delivery_cents,
      'seller_delivery_quote_id',v_quote.id
    ),
    'aspire'
  ) returning id into v_connection_id;

  select id into v_order_id from public.market_orders where connection_id=v_connection_id;
  if v_order_id is null then raise exception 'MARKET_ORDER_CREATE_FAILED'; end if;

  insert into public.market_seller_delivery_private_addresses (
    market_order_id,buyer_id,address,instructions
  ) values (
    v_order_id,v_quote.buyer_id,v_address,v_instructions
  );

  update public.market_orders
  set seller_delivery_fee_cents=v_delivery_cents,
      seller_delivery_status='awaiting_payment', seller_delivery_last_event_at=now(),
      updated_at=now()
  where id=v_order_id;

  update public.market_seller_delivery_quotes
  set status='accepted', connection_id=v_connection_id, market_order_id=v_order_id,
      accepted_at=now(), updated_at=now()
  where id=v_quote.id;

  update public.requests set status='matched', updated_at=now() where id=v_request.id;

  return v_connection_id;
end;
$function$;

grant execute on function public.accept_market_seller_delivery_quote(uuid,jsonb,text) to authenticated;

create or replace function public.get_market_seller_delivery_address(p_market_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.market_orders%rowtype;
  v_private public.market_seller_delivery_private_addresses%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_order from public.market_orders where id=p_market_order_id;
  if not found or v_order.fulfillment_method <> 'seller_delivery' then raise exception 'SELLER_DELIVERY_ORDER_NOT_FOUND'; end if;
  if auth.uid() <> v_order.seller_id and auth.uid() <> v_order.buyer_id and not public.is_admin() then
    raise exception 'NOT_ORDER_PARTICIPANT';
  end if;
  if auth.uid() = v_order.seller_id and v_order.status in ('awaiting_payment','payment_processing') then
    raise exception 'ADDRESS_LOCKED_UNTIL_PAYMENT';
  end if;
  select * into v_private from public.market_seller_delivery_private_addresses where market_order_id=p_market_order_id;
  if not found then raise exception 'DELIVERY_ADDRESS_NOT_FOUND'; end if;
  return jsonb_build_object('address',v_private.address,'instructions',v_private.instructions);
end;
$function$;

grant execute on function public.get_market_seller_delivery_address(uuid) to authenticated;

create or replace function public.update_market_seller_delivery_status(
  p_market_order_id uuid,
  p_status text
)
returns public.market_orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.market_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_order from public.market_orders where id=p_market_order_id for update;
  if not found or v_order.fulfillment_method <> 'seller_delivery' then raise exception 'SELLER_DELIVERY_ORDER_NOT_FOUND'; end if;

  if p_status not in ('ready','out_for_delivery','delivered','completed','cancelled') then
    raise exception 'INVALID_SELLER_DELIVERY_STATUS';
  end if;

  if p_status in ('ready','out_for_delivery','delivered') then
    if auth.uid() <> v_order.seller_id then raise exception 'NOT_SELLER'; end if;
    if v_order.status not in ('paid','handoff_confirmed','release_ready') then raise exception 'PAYMENT_REQUIRED'; end if;
  elsif p_status='completed' then
    if auth.uid() <> v_order.buyer_id then raise exception 'NOT_BUYER'; end if;
    if v_order.seller_delivery_status <> 'delivered' then raise exception 'DELIVERY_NOT_MARKED_DELIVERED'; end if;
  elsif p_status='cancelled' then
    if auth.uid() <> v_order.buyer_id and auth.uid() <> v_order.seller_id and not public.is_admin() then
      raise exception 'NOT_ORDER_PARTICIPANT';
    end if;
    if v_order.status not in ('awaiting_payment','cancelled','refunded') then raise exception 'ORDER_CANNOT_CANCEL_DELIVERY'; end if;
  end if;

  update public.market_orders
  set seller_delivery_status=p_status,
      seller_delivery_last_event_at=now(),
      updated_at=now()
  where id=p_market_order_id
  returning * into v_order;
  return v_order;
end;
$function$;

grant execute on function public.update_market_seller_delivery_status(uuid,text) to authenticated;

comment on table public.market_seller_delivery_quotes is
  'Structured seller-delivery negotiation. Exact street address is intentionally excluded.';
comment on table public.market_seller_delivery_private_addresses is
  'Private exact addresses for seller-delivery orders. Seller access is gated by protected payment via RPC.';
