-- Marketplace dispute financial resolution.
-- Financial outcomes stay admin-only and use row locks so refund and payout
-- release cannot win the race at the same time.

create or replace function public.claim_market_dispute_refund(
  p_dispute_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.market_disputes;
  o public.market_orders;
  p public.connection_payments;
  v_claimed_at timestamptz;
begin
  if p_actor_id is null or not exists (
    select 1 from public.user_roles r where r.user_id=p_actor_id and r.role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select * into d from public.market_disputes where id=p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if d.status not in ('open','under_review') then raise exception 'DISPUTE_NOT_OPEN'; end if;

  select * into o from public.market_orders where id=d.market_order_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;

  select * into p from public.connection_payments where connection_id=o.connection_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if p.status='refunded' then
    return jsonb_build_object('status','already_refunded','payment_id',p.id);
  end if;
  if p.status='released' or p.stripe_transfer_id is not null then raise exception 'PAYOUT_ALREADY_RELEASED'; end if;
  if p.status<>'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;

  if p.release_claimed_at is not null and p.release_claimed_at > now()-interval '5 minutes' then
    raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
  end if;
  if p.refund_claimed_at is not null and p.refund_claimed_at > now()-interval '5 minutes' then
    raise exception 'REFUND_IN_PROGRESS';
  end if;
  if exists (
    select 1 from public.connection_resolution_cases c
    where c.connection_id=o.connection_id and c.status in ('submitted','under_review')
  ) then raise exception 'RESOLUTION_CASE_OPEN'; end if;

  v_claimed_at:=now();
  update public.connection_payments
  set refund_claimed_at=v_claimed_at, updated_at=v_claimed_at
  where id=p.id;

  update public.market_disputes
  set status='under_review', updated_at=v_claimed_at
  where id=d.id;

  return jsonb_build_object(
    'status','claimed',
    'claimed_at',v_claimed_at,
    'payment_id',p.id,
    'connection_id',p.connection_id,
    'customer_total_cents',coalesce(p.customer_total_cents,p.gross_amount_cents),
    'stripe_payment_intent_id',p.stripe_payment_intent_id,
    'stripe_charge_id',p.stripe_charge_id
  );
end;
$$;

create or replace function public.finalize_market_dispute_refund(
  p_dispute_id uuid,
  p_payment_id uuid,
  p_refund_id text,
  p_amount_cents integer,
  p_actor_id uuid,
  p_note text default null,
  p_stripe_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.market_disputes;
  o public.market_orders;
  p public.connection_payments;
  v_now timestamptz:=now();
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),2000),'');
begin
  if p_actor_id is null or not exists (
    select 1 from public.user_roles r where r.user_id=p_actor_id and r.role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_refund_id,'')),'') is null then raise exception 'REFUND_ID_REQUIRED'; end if;

  select * into d from public.market_disputes where id=p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;

  select * into o from public.market_orders where id=d.market_order_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;

  select * into p from public.connection_payments where id=p_payment_id for update;
  if not found or p.connection_id<>o.connection_id then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status='released' or p.stripe_transfer_id is not null then raise exception 'PAYOUT_ALREADY_RELEASED'; end if;
  if p.status not in ('secured','refunded') then raise exception 'PAYMENT_NOT_REFUNDABLE'; end if;

  update public.connection_payments
  set status='refunded',
      stripe_refund_id=coalesce(stripe_refund_id,p_refund_id),
      refunded_at=coalesce(refunded_at,v_now),
      refund_claimed_at=null,
      release_claimed_at=null,
      failure_reason=null,
      updated_at=v_now
  where id=p.id;

  update public.market_orders
  set status='refunded',
      refunded_at=coalesce(refunded_at,v_now),
      updated_at=v_now
  where id=o.id;

  update public.market_disputes
  set status='resolved_buyer',
      resolution_note=coalesce(v_note,'Buyer refund approved after Aspire marketplace dispute review.'),
      resolved_at=coalesce(resolved_at,v_now),
      updated_at=v_now
  where id=d.id;

  update public.connections
  set status=case when status in ('pending','confirmed','active') then 'cancelled' else status end,
      updated_at=v_now
  where id=o.connection_id;

  update public.requests
  set status=case when status in ('open','matched','in_progress') then 'cancelled' else status end,
      updated_at=v_now
  where id=o.request_id;

  if not exists (
    select 1 from public.market_order_events e
    where e.market_order_id=o.id
      and e.event_type='dispute_resolved'
      and e.payload->>'dispute_id'=d.id::text
      and e.payload->>'outcome'='buyer_refund'
  ) then
    insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
    values (
      o.id,p_actor_id,'dispute_resolved',
      jsonb_strip_nulls(jsonb_build_object(
        'dispute_id',d.id,'outcome','buyer_refund','stripe_refund_id',p_refund_id,
        'refund_cents',greatest(coalesce(p_amount_cents,0),0),
        'stripe_status',p_stripe_status
      ))
    );
  end if;

  perform public.push_notification(
    o.buyer_id,'market_order','market-dispute-refund:'||d.id::text,
    'Marketplace dispute resolved — refund issued',
    'Aspire approved a full refund. Bank posting time can vary after Stripe processes it.',
    p_actor_id,o.request_id,null,o.connection_id,null
  );
  perform public.push_notification(
    o.seller_id,'market_order','market-dispute-refund-seller:'||d.id::text,
    'Marketplace dispute resolved',
    'Aspire resolved this order with a buyer refund. No seller payout will be released for this payment.',
    p_actor_id,o.request_id,null,o.connection_id,null
  );

  return jsonb_build_object(
    'status','resolved_buyer','refund_id',p_refund_id,
    'refund_cents',greatest(coalesce(p_amount_cents,0),0),
    'order_id',o.id,'connection_id',o.connection_id
  );
end;
$$;

create or replace function public.resolve_market_dispute_for_seller(
  p_dispute_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.market_disputes;
  o public.market_orders;
  p public.connection_payments;
  v_now timestamptz:=now();
  v_status text;
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),2000),'');
begin
  if p_actor_id is null or not exists (
    select 1 from public.user_roles r where r.user_id=p_actor_id and r.role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if v_note is null or char_length(v_note)<8 then raise exception 'REVIEW_NOTE_REQUIRED'; end if;

  select * into d from public.market_disputes where id=p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if d.status not in ('open','under_review') then raise exception 'DISPUTE_NOT_OPEN'; end if;

  select * into o from public.market_orders where id=d.market_order_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;

  select * into p from public.connection_payments where connection_id=o.connection_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status<>'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;
  if p.refund_claimed_at is not null and p.refund_claimed_at>now()-interval '5 minutes' then
    raise exception 'REFUND_IN_PROGRESS';
  end if;
  if exists (
    select 1 from public.connection_resolution_cases c
    where c.connection_id=o.connection_id and c.status in ('submitted','under_review')
  ) then raise exception 'RESOLUTION_CASE_OPEN'; end if;

  v_status:=case
    when o.buyer_received_at is not null and o.seller_handed_off_at is not null then 'release_ready'
    when o.seller_handed_off_at is not null then 'handoff_confirmed'
    else 'paid'
  end;

  update public.market_disputes
  set status='resolved_seller',
      resolution_note=v_note,
      resolved_at=v_now,
      updated_at=v_now
  where id=d.id;

  update public.market_orders
  set status=v_status, updated_at=v_now
  where id=o.id;

  insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
  values (
    o.id,p_actor_id,'dispute_resolved',
    jsonb_build_object('dispute_id',d.id,'outcome','seller_resume','restored_order_status',v_status)
  );

  perform public.push_notification(
    o.buyer_id,'market_order','market-dispute-seller:'||d.id::text||':'||o.buyer_id::text,
    'Marketplace dispute reviewed',
    'Aspire closed the dispute without a buyer refund. The protected order will continue from its prior handoff stage.',
    p_actor_id,o.request_id,null,o.connection_id,null
  );
  perform public.push_notification(
    o.seller_id,'market_order','market-dispute-seller:'||d.id::text||':'||o.seller_id::text,
    'Marketplace dispute reviewed',
    'Aspire closed the dispute and restored the protected payout flow. Normal release checks still apply.',
    p_actor_id,o.request_id,null,o.connection_id,null
  );

  return jsonb_build_object('status','resolved_seller','order_status',v_status,'order_id',o.id,'connection_id',o.connection_id);
end;
$$;

revoke all on function public.claim_market_dispute_refund(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finalize_market_dispute_refund(uuid,uuid,text,integer,uuid,text,text) from public,anon,authenticated;
revoke all on function public.resolve_market_dispute_for_seller(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_market_dispute_refund(uuid,uuid) to service_role;
grant execute on function public.finalize_market_dispute_refund(uuid,uuid,text,integer,uuid,text,text) to service_role;
grant execute on function public.resolve_market_dispute_for_seller(uuid,uuid,text) to service_role;
