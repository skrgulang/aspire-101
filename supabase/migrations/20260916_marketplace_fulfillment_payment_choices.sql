alter table public.market_orders
  add column if not exists shipping_paid_by text,
  add column if not exists payment_choice text;

alter table public.market_orders
  drop constraint if exists market_orders_shipping_paid_by_check;
alter table public.market_orders
  add constraint market_orders_shipping_paid_by_check
  check (shipping_paid_by is null or shipping_paid_by in ('buyer','seller'));

alter table public.market_orders
  drop constraint if exists market_orders_payment_choice_check;
alter table public.market_orders
  add constraint market_orders_payment_choice_check
  check (payment_choice is null or payment_choice in ('aspire','in_person'));

drop function if exists public.purchase_marketplace_listing(uuid,text);
drop function if exists public.purchase_marketplace_listing(uuid,text,text,text);

create function public.purchase_marketplace_listing(
  p_request_id uuid,
  p_fulfillment_method text default null,
  p_payment_method text default 'aspire',
  p_shipping_paid_by text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request public.requests;
  v_buyer uuid := auth.uid();
  v_connection_id uuid;
  v_allowed_methods text[];
  v_fulfillment_method text;
  v_payment_method text;
  v_shipping_paid_by text;
begin
  if v_buyer is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_request.poster_id = v_buyer then raise exception 'CANNOT_BUY_OWN_LISTING'; end if;
  if v_request.kind <> 'buy_sell' or v_request.market_intent <> 'sell' then raise exception 'NOT_A_LISTING'; end if;
  if v_request.payment_method <> 'aspire' then raise exception 'MARKETPLACE_REQUIRES_ASPIRE'; end if;
  if v_request.status <> 'open' then raise exception 'LISTING_UNAVAILABLE'; end if;
  if v_request.listing_expires_at is not null and v_request.listing_expires_at <= now() then
    update public.requests set status='expired',updated_at=now() where id=v_request.id;
    raise exception 'LISTING_EXPIRED';
  end if;
  if coalesce(v_request.amount_cents,0) <= 0 then raise exception 'LISTING_HAS_NO_PRICE'; end if;
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id=v_buyer and ub.blocked_id=v_request.poster_id)
       or (ub.blocker_id=v_request.poster_id and ub.blocked_id=v_buyer)
  ) then raise exception 'LISTING_UNAVAILABLE'; end if;
  if exists (select 1 from public.connections where request_id=v_request.id and status <> 'cancelled') then
    raise exception 'LISTING_UNAVAILABLE';
  end if;

  v_allowed_methods := coalesce(v_request.fulfillment_methods,array[coalesce(v_request.fulfillment_method,'campus_pickup')]);
  if array_length(v_allowed_methods,1) is null then v_allowed_methods := array['campus_pickup']; end if;
  v_fulfillment_method := coalesce(nullif(p_fulfillment_method,''),v_request.fulfillment_method,v_allowed_methods[1],'campus_pickup');
  if v_fulfillment_method not in ('campus_pickup','shipping','aspirer_delivery') then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
  if not v_fulfillment_method = any(v_allowed_methods) then raise exception 'FULFILLMENT_METHOD_NOT_OFFERED'; end if;

  v_payment_method := coalesce(nullif(p_payment_method,''),'aspire');
  if v_payment_method not in ('aspire','in_person') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if v_payment_method='in_person' and v_fulfillment_method <> 'campus_pickup' then raise exception 'PAYMENT_METHOD_NOT_ALLOWED'; end if;

  v_shipping_paid_by := case when v_fulfillment_method='shipping' then coalesce(nullif(p_shipping_paid_by,''),'buyer') else null end;
  if v_shipping_paid_by is not null and v_shipping_paid_by not in ('buyer','seller') then raise exception 'INVALID_SHIPPING_PAYER'; end if;

  insert into public.connections (
    request_id,requester_id,responder_id,requester_confirmed,responder_confirmed,
    status,agreed_amount_cents,agreed_terms,payment_method
  ) values (
    v_request.id,v_request.poster_id,v_buyer,true,true,
    'confirmed',v_request.amount_cents,
    jsonb_strip_nulls(jsonb_build_object(
      'category',v_request.category,
      'kind',v_request.kind,
      'source','marketplace_buy_now',
      'protection',case when v_payment_method='aspire' then 'aspire_protected' else 'in_person' end,
      'fulfillment_method',v_fulfillment_method,
      'shipping_paid_by',v_shipping_paid_by
    )),
    v_payment_method
  ) returning id into v_connection_id;

  update public.requests set status='matched',updated_at=now() where id=v_request.id;
  return v_connection_id;
end;
$$;

grant execute on function public.purchase_marketplace_listing(uuid,text,text,text) to authenticated;
grant execute on function public.purchase_marketplace_listing(uuid,text,text,text) to service_role;

create or replace function public.ensure_market_order_for_connection()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.requests%rowtype;
  v_buyer uuid;
  v_seller uuid;
  v_amount integer;
  v_status text;
  v_fulfillment_method text;
  v_shipping_paid_by text;
  v_payment_choice text;
begin
  select * into r from public.requests where id=new.request_id;
  if not found or r.kind <> 'buy_sell' or r.market_intent is null then return new; end if;
  v_amount := coalesce(new.agreed_amount_cents,r.amount_cents,0);
  if v_amount <= 0 then return new; end if;

  if r.market_intent='sell' then
    v_seller := r.poster_id;
    v_buyer := new.responder_id;
  else
    v_buyer := r.poster_id;
    v_seller := new.responder_id;
  end if;

  v_fulfillment_method := coalesce(new.agreed_terms->>'fulfillment_method',r.fulfillment_method,r.fulfillment_methods[1],'campus_pickup');
  if v_fulfillment_method not in ('campus_pickup','shipping','aspirer_delivery') then v_fulfillment_method := 'campus_pickup'; end if;
  v_shipping_paid_by := nullif(new.agreed_terms->>'shipping_paid_by','');
  v_payment_choice := coalesce(new.payment_method,r.payment_method,'none');
  v_status := case when v_payment_choice='aspire' then 'awaiting_payment' else 'off_platform' end;

  insert into public.market_orders (
    connection_id,request_id,buyer_id,seller_id,listing_intent,
    fulfillment_method,currency,agreed_amount_cents,status,shipping_paid_by,payment_choice
  ) values (
    new.id,r.id,v_buyer,v_seller,r.market_intent,
    v_fulfillment_method,coalesce(r.currency,'USD'),v_amount,v_status,v_shipping_paid_by,v_payment_choice
  )
  on conflict (connection_id) do update set
    buyer_id=excluded.buyer_id,
    seller_id=excluded.seller_id,
    agreed_amount_cents=excluded.agreed_amount_cents,
    fulfillment_method=excluded.fulfillment_method,
    currency=excluded.currency,
    shipping_paid_by=excluded.shipping_paid_by,
    payment_choice=excluded.payment_choice,
    updated_at=now();
  return new;
end;
$$;
