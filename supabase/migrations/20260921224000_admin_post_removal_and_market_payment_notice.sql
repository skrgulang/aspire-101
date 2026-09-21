-- Marketplace reservation reminders and notification routing.
-- A Buy Now reservation should tell the buyer exactly where payment happens,
-- while the seller is told not to hand off before Aspire Protected payment.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind in (
  'request_response','connection_chosen','connection_confirmed','connection_completed','connection_cancelled',
  'message','circle_mutual','connection_reminder','connection_coordination','resolution_case','post_review',
  'market_order'
));

create or replace function public.notify_connection_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_actor uuid;
  v_other uuid;
begin
  select title into v_title from public.requests where id=new.request_id;
  v_actor := auth.uid();

  if tg_op='INSERT' then
    -- Marketplace Buy Now creates an already-confirmed connection. A dedicated
    -- market_order notification is emitted by purchase_marketplace_listing so
    -- the buyer is not shown the generic "you were chosen" copy.
    if coalesce(new.agreed_terms->>'source','') = 'marketplace_buy_now' then
      return new;
    end if;

    perform public.push_notification(
      new.responder_id,
      'connection_chosen',
      'connection-chosen:'||new.id::text,
      'You were chosen for a request',
      coalesce('Confirm “'||v_title||'” to open private chat.','Confirm the connection to open private chat.'),
      new.requester_id,new.request_id,null,new.id,null
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status in ('confirmed','active') and old.status not in ('confirmed','active') then
      perform public.push_notification(
        new.requester_id,'connection_confirmed','connection-confirmed:'||new.id::text,
        'Your connection is confirmed',
        coalesce('Private chat is open for “'||v_title||'”.','Private chat is now open.'),
        new.responder_id,new.request_id,null,new.id,null
      );
    elsif new.status='completed' and old.status<>'completed' then
      perform public.push_notification(
        new.requester_id,'connection_completed','connection-completed:'||new.id::text||':'||new.requester_id::text,
        'Connection completed',
        'You can now leave a trust review and choose whether to keep in touch.',
        v_actor,new.request_id,null,new.id,null
      );
      perform public.push_notification(
        new.responder_id,'connection_completed','connection-completed:'||new.id::text||':'||new.responder_id::text,
        'Connection completed',
        'You can now leave a trust review and choose whether to keep in touch.',
        v_actor,new.request_id,null,new.id,null
      );
    elsif new.status='cancelled' and old.status<>'cancelled' then
      if v_actor=new.requester_id then v_other:=new.responder_id;
      elsif v_actor=new.responder_id then v_other:=new.requester_id;
      else v_other:=new.requester_id; end if;
      perform public.push_notification(
        v_other,'connection_cancelled','connection-cancelled:'||new.id::text||':'||v_other::text,
        'A connection was cancelled',
        coalesce('The connection for “'||v_title||'” is no longer active.','This connection is no longer active.'),
        v_actor,new.request_id,null,new.id,null
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_connection_change() from public, anon, authenticated;

create or replace function public.purchase_marketplace_listing(
  p_request_id uuid,
  p_fulfillment_method text default null,
  p_payment_method text default 'aspire',
  p_shipping_paid_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests;
  v_buyer uuid := auth.uid();
  v_connection_id uuid;
  v_allowed_methods text[];
  v_fulfillment_method text;
  v_payment_method text;
  v_shipping_paid_by text;
  v_shipping_policy text;
begin
  if v_buyer is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_request.poster_id = v_buyer then raise exception 'CANNOT_BUY_OWN_LISTING'; end if;
  if v_request.kind <> 'buy_sell' or v_request.market_intent <> 'sell' then raise exception 'NOT_A_LISTING'; end if;
  if v_request.payment_method <> 'aspire' then raise exception 'MARKETPLACE_REQUIRES_ASPIRE'; end if;
  if v_request.status <> 'open' then raise exception 'LISTING_UNAVAILABLE'; end if;
  if v_request.listing_expires_at is not null and v_request.listing_expires_at <= now() then
    update public.requests set status = 'expired', updated_at = now() where id = v_request.id;
    raise exception 'LISTING_EXPIRED';
  end if;
  if coalesce(v_request.amount_cents, 0) <= 0 then raise exception 'LISTING_HAS_NO_PRICE'; end if;
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = v_buyer and ub.blocked_id = v_request.poster_id)
       or (ub.blocker_id = v_request.poster_id and ub.blocked_id = v_buyer)
  ) then raise exception 'LISTING_UNAVAILABLE'; end if;
  if exists (select 1 from public.connections where request_id = v_request.id and status <> 'cancelled') then
    raise exception 'LISTING_UNAVAILABLE';
  end if;

  v_allowed_methods := coalesce(v_request.fulfillment_methods, array[coalesce(v_request.fulfillment_method, 'campus_pickup')]);
  if array_length(v_allowed_methods, 1) is null then v_allowed_methods := array['campus_pickup']; end if;

  v_fulfillment_method := coalesce(nullif(p_fulfillment_method, ''), v_request.fulfillment_method, v_allowed_methods[1], 'campus_pickup');
  if not (v_fulfillment_method = any(array['campus_pickup','shipping','aspirer_delivery'])) then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;
  if not (v_fulfillment_method = any(v_allowed_methods)) then raise exception 'FULFILLMENT_METHOD_NOT_OFFERED'; end if;

  v_payment_method := coalesce(nullif(p_payment_method,''), 'aspire');
  if not (v_payment_method = any(array['aspire','in_person'])) then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if v_payment_method = 'in_person' and v_fulfillment_method <> 'campus_pickup' then raise exception 'PAYMENT_METHOD_NOT_ALLOWED'; end if;

  if v_fulfillment_method = 'shipping' then
    v_shipping_policy := coalesce(v_request.shipping_paid_by_default, v_request.shipping_paid_by_preference, 'buyer');
    if not (v_shipping_policy = any(array['buyer','seller','either'])) then v_shipping_policy := 'buyer'; end if;
    v_shipping_paid_by := coalesce(nullif(p_shipping_paid_by,''), case when v_shipping_policy='seller' then 'seller' else 'buyer' end);
    if not (v_shipping_paid_by = any(array['buyer','seller'])) then raise exception 'INVALID_SHIPPING_PAYER'; end if;
    if v_shipping_policy <> 'either' and v_shipping_paid_by <> v_shipping_policy then raise exception 'SHIPPING_PAYER_NOT_OFFERED'; end if;
  else
    v_shipping_paid_by := null;
  end if;

  insert into public.connections (
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, agreed_terms, payment_method
  ) values (
    v_request.id, v_request.poster_id, v_buyer, true, true,
    'confirmed', v_request.amount_cents,
    jsonb_strip_nulls(jsonb_build_object(
      'category', v_request.category,
      'kind', v_request.kind,
      'source', 'marketplace_buy_now',
      'protection', case when v_payment_method = 'aspire' then 'aspire_protected' else 'in_person' end,
      'fulfillment_method', v_fulfillment_method,
      'shipping_paid_by', v_shipping_paid_by
    )),
    v_payment_method
  ) returning id into v_connection_id;

  update public.requests set status = 'matched', updated_at = now() where id = v_request.id;

  if v_payment_method = 'aspire' then
    perform public.push_notification(
      v_buyer,
      'market_order',
      'market-payment-due:'||v_connection_id::text,
      'Item reserved — finish payment',
      'Open Orders and tap the gold Secure payment button to complete Aspire Protected checkout before pickup or delivery.',
      v_request.poster_id,
      v_request.id,
      null,
      v_connection_id,
      null
    );
    perform public.push_notification(
      v_request.poster_id,
      'market_order',
      'market-awaiting-payment:'||v_connection_id::text,
      'Your item is reserved',
      'The buyer has reserved this item. Wait for Aspire Protected payment to show as secured in Orders before handoff.',
      v_buyer,
      v_request.id,
      null,
      v_connection_id,
      null
    );
  else
    perform public.push_notification(
      v_buyer,
      'market_order',
      'market-meetup-reserved:'||v_connection_id::text,
      'Item reserved for meetup',
      'Open Orders for the meetup details. This order is marked Pay in person and is not Aspire Protected.',
      v_request.poster_id,
      v_request.id,
      null,
      v_connection_id,
      null
    );
  end if;

  return v_connection_id;
end;
$$;

revoke all on function public.purchase_marketplace_listing(uuid,text,text,text) from public, anon;
grant execute on function public.purchase_marketplace_listing(uuid,text,text,text) to authenticated;
