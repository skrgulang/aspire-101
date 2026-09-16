-- Serialize new payout holds against an already-claimed provider release.
--
-- A payout release claim is the commit boundary immediately before the external
-- Stripe transfer. Any dispute/refund/resolution/cancellation that wins the
-- protected-payment row lock first will be visible to claim_connection_payment_release().
-- If release already won that lock, a later hold fails closed instead of claiming
-- that payout is paused while the external transfer may already be in progress.

create or replace function public.assert_payout_hold_can_open(
  p_connection_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.connections%rowtype;
  v_payment public.connection_payments%rowtype;
begin
  if p_actor_id is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Read participant identity without taking the connection lock yet. Hold-opening
  -- RPCs take their normal connection/order locks after this helper has established
  -- the canonical payment-first order.
  select * into v_connection
  from public.connections
  where id = p_connection_id;

  if not found then raise exception 'CONNECTION_NOT_FOUND'; end if;
  if p_actor_id not in (v_connection.requester_id, v_connection.responder_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;

  select * into v_payment
  from public.connection_payments
  where connection_id = p_connection_id
  for update;

  if not found then return; end if;

  -- Do not clear a release claim here. If Stripe succeeded but the local finalize
  -- write was interrupted, treating an old claim as harmless could incorrectly
  -- promise that a newly opened case/refund has paused money that already moved.
  if v_payment.status = 'secured'
     and (v_payment.release_claimed_at is not null or v_payment.stripe_transfer_id is not null) then
    raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
  end if;
end;
$$;

revoke all on function public.assert_payout_hold_can_open(uuid,uuid) from public, anon, authenticated;
grant execute on function public.assert_payout_hold_can_open(uuid,uuid) to service_role;

create or replace function public.market_open_dispute(
  p_connection_id uuid,
  p_reason text,
  p_details text
)
returns public.market_disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
  d public.market_disputes;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Payment lock first. If a payout release already claimed the payment, do not
  -- create a dispute whose UI would incorrectly promise that payout is paused.
  perform public.assert_payout_hold_can_open(p_connection_id, auth.uid());

  select * into o
  from public.market_orders
  where connection_id = p_connection_id
  for update;

  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if auth.uid() <> o.buyer_id and auth.uid() <> o.seller_id then raise exception 'NOT_PARTICIPANT'; end if;
  if o.status not in ('paid','handoff_confirmed','release_ready') then raise exception 'DISPUTE_NOT_AVAILABLE'; end if;
  if p_reason not in ('item_not_as_described','item_not_received','counterfeit_or_prohibited','payment_issue','unsafe_handoff','other') then raise exception 'INVALID_DISPUTE_REASON'; end if;
  if char_length(btrim(coalesce(p_details,''))) < 10 then raise exception 'DISPUTE_DETAILS_REQUIRED'; end if;

  if exists (
    select 1 from public.market_disputes
    where market_order_id = o.id and status in ('open','under_review')
  ) then
    raise exception 'DISPUTE_ALREADY_OPEN';
  end if;

  insert into public.market_disputes(market_order_id, opened_by, reason, details)
  values (o.id, auth.uid(), p_reason, btrim(p_details))
  returning * into d;

  update public.market_orders
  set status = 'disputed', dispute_opened_at = now(), updated_at = now()
  where id = o.id;

  insert into public.market_order_events(market_order_id, actor_id, event_type, payload)
  values (o.id, auth.uid(), 'dispute_opened', jsonb_build_object('dispute_id', d.id, 'reason', p_reason));

  return d;
end;
$$;

create or replace function public.request_payment_refund(
  p_connection_id uuid,
  p_reason text,
  p_details text
)
returns public.payment_refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.connection_payments;
  r public.payment_refund_requests;
  anchor_ts timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_reason not in ('not_received','not_as_described','service_not_completed','wrong_charge','unsafe_or_cancelled','other') then raise exception 'INVALID_REFUND_REASON'; end if;
  if char_length(btrim(coalesce(p_details,''))) < 10 then raise exception 'REFUND_DETAILS_REQUIRED'; end if;

  perform public.assert_payout_hold_can_open(p_connection_id, auth.uid());

  select * into p
  from public.connection_payments
  where connection_id = p_connection_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if auth.uid() <> p.payer_id then raise exception 'ONLY_PAYER_CAN_REQUEST_REFUND'; end if;
  if p.status not in ('secured','released') then raise exception 'REFUND_REQUEST_NOT_AVAILABLE'; end if;

  select * into r
  from public.payment_refund_requests
  where payment_id = p.id
    and requested_by = auth.uid()
    and status in ('open','under_review','approved')
  order by created_at desc
  limit 1;
  if found then return r; end if;

  anchor_ts := coalesce(p.released_at,p.paid_at,p.updated_at);
  if anchor_ts < now() - interval '7 days' then raise exception 'REFUND_REVIEW_WINDOW_CLOSED'; end if;

  insert into public.payment_refund_requests(
    payment_id,connection_id,requested_by,reason,details,requested_amount_cents
  ) values (
    p.id,p.connection_id,auth.uid(),p_reason,btrim(p_details),coalesce(p.customer_total_cents,p.gross_amount_cents)
  )
  returning * into r;

  return r;
end;
$$;

create or replace function public.open_connection_resolution_case(
  p_connection_id uuid,
  p_reason text,
  p_details text default null,
  p_requested_resolution text default 'review',
  p_against_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_connection public.connections;
  v_case_id uuid;
  v_against uuid;
  v_payment_status text;
  v_payment_total integer;
  v_currency text;
  v_events jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_reason not in ('no_show','cancellation','incomplete','not_as_described','payment','safety','other') then raise exception 'Invalid issue type'; end if;
  if p_requested_resolution not in ('refund','provider_compensation','partial','review','safety_review') then raise exception 'Invalid requested resolution'; end if;

  -- Establish the payment lock before the connection row lock. This makes a new
  -- Resolution Center hold and a provider-release claim deterministic: whichever
  -- owns the payment lock first commits its decision first.
  perform public.assert_payout_hold_can_open(p_connection_id, auth.uid());

  select * into v_connection
  from public.connections
  where id = p_connection_id
  for update;

  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active','completed','cancelled') then raise exception 'This connection is not eligible for a resolution case'; end if;

  select id into v_case_id
  from public.connection_resolution_cases
  where connection_id = p_connection_id and status in ('submitted','under_review')
  order by created_at desc limit 1;
  if found then return v_case_id; end if;

  v_against := coalesce(
    p_against_user_id,
    case when auth.uid() = v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end
  );
  if v_against = auth.uid() then raise exception 'You cannot file a case against yourself'; end if;
  if v_against <> v_connection.requester_id and v_against <> v_connection.responder_id then raise exception 'The reported account is not part of this connection'; end if;

  if p_reason = 'no_show' then
    if v_connection.scheduled_start_at is null then raise exception 'Set an agreed meeting time before reporting a no-show'; end if;
    if now() < v_connection.scheduled_start_at + interval '10 minutes' then raise exception 'NO_SHOW_GRACE_PERIOD'; end if;
  end if;

  select cp.status,coalesce(cp.customer_total_cents,cp.gross_amount_cents),cp.currency
  into v_payment_status,v_payment_total,v_currency
  from public.connection_payments cp
  where cp.connection_id = p_connection_id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event_type',e.event_type,'actor_id',e.actor_id,'body',e.body,'created_at',e.created_at
      ) order by e.created_at
    ),
    '[]'::jsonb
  )
  into v_events
  from (
    select event_type,actor_id,body,created_at
    from public.connection_events
    where connection_id = p_connection_id
    order by created_at desc
    limit 25
  ) e;

  insert into public.connection_resolution_cases(
    connection_id,request_id,opened_by,against_user_id,reason,requested_resolution,details,
    payment_status_snapshot,payment_total_cents_snapshot,currency_snapshot,
    scheduled_start_snapshot,meeting_label_snapshot,coordination_status_snapshot,evidence_snapshot
  ) values (
    p_connection_id,v_connection.request_id,auth.uid(),v_against,p_reason,p_requested_resolution,
    nullif(left(btrim(coalesce(p_details,'')),2000),''),
    v_payment_status,v_payment_total,v_currency,
    v_connection.scheduled_start_at,v_connection.meeting_label,v_connection.coordination_status,
    jsonb_build_object(
      'captured_at',now(),
      'connection_status',v_connection.status,
      'last_coordination_actor_id',v_connection.last_coordination_actor_id,
      'last_coordination_at',v_connection.last_coordination_at,
      'events',coalesce(v_events,'[]'::jsonb)
    )
  ) returning id into v_case_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    p_connection_id,auth.uid(),'issue_opened',
    'An Aspire Resolution Center case was opened. Payment release is paused while the issue is open.',
    jsonb_build_object('case_id',v_case_id,'reason',p_reason)
  );

  return v_case_id;
end;
$$;

-- Preserve the intended browser-facing RPC surface. The internal lock helper stays
-- owner/service-role only.
revoke all on function public.market_open_dispute(uuid,text,text) from public, anon;
grant execute on function public.market_open_dispute(uuid,text,text) to authenticated;
revoke all on function public.request_payment_refund(uuid,text,text) from public, anon;
grant execute on function public.request_payment_refund(uuid,text,text) to authenticated;
revoke all on function public.open_connection_resolution_case(uuid,text,text,text,uuid) from public, anon;
grant execute on function public.open_connection_resolution_case(uuid,text,text,text,uuid) to authenticated;
