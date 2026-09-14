-- Serialize every full refund against payout release, then commit the payment,
-- order, connection, Resolution Center, and History-visible states atomically.

alter table public.connection_payments
  add column if not exists refund_claimed_at timestamptz;

create or replace function public.guard_financial_hold_against_payout_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
begin
  if tg_table_name = 'connection_resolution_cases' then
    select * into v_payment
    from public.connection_payments
    where connection_id = new.connection_id
    for update;
  elsif tg_table_name = 'market_disputes' then
    select cp.* into v_payment
    from public.market_orders mo
    join public.connection_payments cp on cp.connection_id = mo.connection_id
    where mo.id = new.market_order_id
    for update of cp;
  elsif tg_table_name = 'payment_refund_requests' then
    select * into v_payment
    from public.connection_payments
    where id = new.payment_id
    for update;
  end if;

  if found and v_payment.status = 'secured' then
    if v_payment.release_claimed_at is not null then
      if v_payment.release_claimed_at > now() - interval '5 minutes' then
        raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
      end if;
      update public.connection_payments
      set release_claimed_at = null, updated_at = now()
      where id = v_payment.id
        and status = 'secured'
        and release_claimed_at = v_payment.release_claimed_at;
    end if;

    if v_payment.refund_claimed_at is not null then
      if v_payment.refund_claimed_at > now() - interval '5 minutes' then
        raise exception 'REFUND_IN_PROGRESS';
      end if;
      update public.connection_payments
      set refund_claimed_at = null, updated_at = now()
      where id = v_payment.id
        and status = 'secured'
        and refund_claimed_at = v_payment.refund_claimed_at;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_financial_hold_against_payout_release() from public, anon, authenticated;

create or replace function public.claim_connection_payment_release(p_payment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
  v_claimed_at timestamptz;
begin
  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status = 'released' then
    return coalesce(v_payment.release_claimed_at, v_payment.released_at, now());
  end if;
  if v_payment.status <> 'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;

  if v_payment.refund_claimed_at is not null then
    if v_payment.refund_claimed_at > now() - interval '5 minutes' then
      raise exception 'REFUND_IN_PROGRESS';
    end if;
    update public.connection_payments
    set refund_claimed_at = null, updated_at = now()
    where id = v_payment.id
      and status = 'secured'
      and refund_claimed_at = v_payment.refund_claimed_at;
  end if;

  if exists (
    select 1 from public.connections c
    where c.id = v_payment.connection_id and c.status = 'cancelled'
  ) then raise exception 'CONNECTION_CANCELLED'; end if;

  if exists (
    select 1 from public.connection_resolution_cases crc
    where crc.connection_id = v_payment.connection_id
      and crc.status in ('submitted','under_review')
  ) then raise exception 'PAYOUT_HOLD_OPEN'; end if;

  if exists (
    select 1 from public.payment_refund_requests prr
    where prr.payment_id = v_payment.id
      and prr.status in ('open','under_review','approved')
  ) then raise exception 'PAYOUT_HOLD_OPEN'; end if;

  if exists (
    select 1
    from public.market_orders mo
    where mo.connection_id = v_payment.connection_id
      and (
        mo.status = 'disputed'
        or exists (
          select 1 from public.market_disputes md
          where md.market_order_id = mo.id
            and md.status in ('open','under_review')
        )
      )
  ) then raise exception 'PAYOUT_HOLD_OPEN'; end if;

  if v_payment.release_claimed_at is not null
     and v_payment.release_claimed_at > now() - interval '5 minutes' then
    return v_payment.release_claimed_at;
  end if;

  v_claimed_at := now();
  update public.connection_payments
  set release_claimed_at = v_claimed_at, updated_at = v_claimed_at
  where id = v_payment.id;
  return v_claimed_at;
end;
$$;

create or replace function public.claim_connection_payment_refund(
  p_payment_id uuid,
  p_resolution_case_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
  v_claimed_at timestamptz;
  v_open_case_id uuid;
begin
  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status = 'refunded' then
    return coalesce(v_payment.refund_claimed_at, v_payment.refunded_at, now());
  end if;
  if v_payment.status = 'released' or v_payment.stripe_transfer_id is not null then
    raise exception 'PAYOUT_ALREADY_RELEASED';
  end if;
  if v_payment.status <> 'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;

  if v_payment.release_claimed_at is not null then
    if v_payment.release_claimed_at > now() - interval '5 minutes' then
      raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
    end if;
    update public.connection_payments
    set release_claimed_at = null, updated_at = now()
    where id = v_payment.id
      and status = 'secured'
      and release_claimed_at = v_payment.release_claimed_at;
  end if;

  select crc.id into v_open_case_id
  from public.connection_resolution_cases crc
  where crc.connection_id = v_payment.connection_id
    and crc.status in ('submitted','under_review')
  order by crc.created_at desc
  limit 1;

  if v_open_case_id is not null
     and (p_resolution_case_id is null or p_resolution_case_id <> v_open_case_id) then
    raise exception 'RESOLUTION_CASE_OPEN';
  end if;
  if p_resolution_case_id is not null and p_resolution_case_id is distinct from v_open_case_id then
    raise exception 'RESOLUTION_CASE_NOT_OPEN';
  end if;

  if exists (
    select 1
    from public.market_orders mo
    join public.market_disputes md on md.market_order_id = mo.id
    where mo.connection_id = v_payment.connection_id
      and md.status in ('open','under_review')
  ) then raise exception 'MARKET_DISPUTE_OPEN'; end if;

  if v_payment.refund_claimed_at is not null
     and v_payment.refund_claimed_at > now() - interval '5 minutes' then
    return v_payment.refund_claimed_at;
  end if;

  v_claimed_at := now();
  update public.connection_payments
  set refund_claimed_at = v_claimed_at, updated_at = v_claimed_at
  where id = v_payment.id;
  return v_claimed_at;
end;
$$;

create or replace function public.clear_connection_payment_refund_claim(
  p_payment_id uuid,
  p_claimed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.connection_payments
  set refund_claimed_at = null, updated_at = now()
  where id = p_payment_id
    and status = 'secured'
    and refund_claimed_at = p_claimed_at;
  return found;
end;
$$;

create or replace function public.finalize_connection_payment_release(
  p_payment_id uuid,
  p_transfer_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
  v_now timestamptz := now();
  v_duplicate boolean := false;
begin
  if nullif(btrim(coalesce(p_transfer_id,'')),'') is null then raise exception 'TRANSFER_ID_REQUIRED'; end if;

  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if v_payment.status = 'released' then
    if v_payment.stripe_transfer_id is null then
      update public.connection_payments
      set stripe_transfer_id=p_transfer_id,release_claimed_at=null,updated_at=v_now
      where id=v_payment.id;
    elsif v_payment.stripe_transfer_id <> p_transfer_id then
      raise exception 'TRANSFER_ID_MISMATCH';
    end if;
    v_duplicate := true;
  elsif v_payment.status = 'secured' then
    update public.connection_payments
    set status='released',stripe_transfer_id=p_transfer_id,released_at=v_now,
        release_claimed_at=null,failure_reason=null,updated_at=v_now
    where id=v_payment.id;
  else
    raise exception 'PAYMENT_NOT_SECURED';
  end if;

  update public.connections
  set status=case when status in ('pending','confirmed','active') then 'completed' else status end,
      updated_at=v_now
  where id=v_payment.connection_id;

  update public.requests
  set status=case when status in ('open','matched','in_progress') then 'completed' else status end,
      updated_at=v_now
  where id=v_payment.request_id;

  update public.market_orders
  set status='released',released_at=coalesce(released_at,v_now),updated_at=v_now
  where connection_id=v_payment.connection_id and status <> 'refunded';

  return jsonb_build_object(
    'status','released','transfer_id',p_transfer_id,'connection_id',v_payment.connection_id,'duplicate',v_duplicate
  );
end;
$$;

create or replace function public.finalize_connection_payment_refund(
  p_payment_id uuid,
  p_refund_id text,
  p_amount_cents integer,
  p_actor_id uuid default null,
  p_resolution_case_id uuid default null,
  p_note text default null,
  p_stripe_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
  v_order public.market_orders;
  v_case public.connection_resolution_cases;
  v_now timestamptz := now();
  v_amount integer;
  v_note text;
  v_duplicate boolean := false;
begin
  if nullif(btrim(coalesce(p_refund_id,'')),'') is null then raise exception 'REFUND_ID_REQUIRED'; end if;

  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if v_payment.status = 'released' or v_payment.stripe_transfer_id is not null then
    raise exception 'PAYOUT_ALREADY_RELEASED';
  end if;
  if v_payment.status not in ('secured','refunded') then raise exception 'PAYMENT_NOT_REFUNDABLE'; end if;

  if p_actor_id is not null
     and p_actor_id not in (v_payment.payer_id, v_payment.payee_id)
     and not exists (
       select 1 from public.user_roles r
       where r.user_id = p_actor_id and r.role in ('moderator','admin')
     ) then raise exception 'REFUND_ACTOR_NOT_AUTHORIZED'; end if;

  v_amount := greatest(coalesce(p_amount_cents, v_payment.customer_total_cents, v_payment.gross_amount_cents, 0), 0);
  v_note := nullif(left(btrim(coalesce(p_note,'')),2000),'');
  v_duplicate := v_payment.status = 'refunded';

  update public.connection_payments
  set status = 'refunded',
      stripe_refund_id = coalesce(stripe_refund_id, p_refund_id),
      refunded_at = coalesce(refunded_at, v_now),
      refund_claimed_at = null,
      release_claimed_at = null,
      failure_reason = null,
      updated_at = v_now
  where id = v_payment.id;

  select * into v_order
  from public.market_orders
  where connection_id = v_payment.connection_id
  for update;

  if found then
    update public.market_orders
    set status = 'refunded', refunded_at = coalesce(refunded_at, v_now), updated_at = v_now
    where id = v_order.id;

    if not exists (
      select 1 from public.market_order_events e
      where e.market_order_id = v_order.id
        and e.event_type = 'refund_created'
        and e.payload ->> 'stripe_refund_id' = p_refund_id
    ) then
      insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
      values (
        v_order.id,p_actor_id,'refund_created',
        jsonb_build_object('stripe_refund_id',p_refund_id,'stripe_status',p_stripe_status)
      );
    end if;
  end if;

  update public.connections
  set status = case when status in ('pending','confirmed','active') then 'cancelled' else status end,
      updated_at = v_now
  where id = v_payment.connection_id;

  update public.requests
  set status = case when status in ('open','matched','in_progress') then 'cancelled' else status end,
      updated_at = v_now
  where id = v_payment.request_id;

  if p_resolution_case_id is not null then
    select * into v_case
    from public.connection_resolution_cases
    where id = p_resolution_case_id
    for update;
    if not found or v_case.connection_id <> v_payment.connection_id then
      raise exception 'RESOLUTION_CASE_NOT_FOUND';
    end if;
    if v_case.status not in ('submitted','under_review','resolved_refund') then
      raise exception 'RESOLUTION_CASE_ALREADY_CLOSED';
    end if;

    update public.connection_resolution_cases
    set status = 'resolved_refund',
        resolution_note = coalesce(v_note, resolution_note, 'Full Aspire payment refunded after Resolution Center review.'),
        refund_cents = v_amount,
        reviewed_by = coalesce(p_actor_id, reviewed_by),
        reviewed_at = coalesce(reviewed_at, v_now),
        updated_at = v_now
    where id = v_case.id;

    if v_case.reason = 'no_show' and v_case.against_user_id is not null then
      insert into public.connection_no_show_incidents(case_id,connection_id,user_id,confirmed_by,note)
      values (v_case.id,v_case.connection_id,v_case.against_user_id,p_actor_id,coalesce(v_note,'Confirmed no-show after Resolution Center review.'))
      on conflict (case_id) do update set note = coalesce(excluded.note,public.connection_no_show_incidents.note);
    end if;

    if not exists (
      select 1 from public.connection_events e
      where e.connection_id = v_case.connection_id
        and e.event_type = 'issue_resolved'
        and e.metadata ->> 'case_id' = v_case.id::text
        and e.metadata ->> 'status' = 'resolved_refund'
    ) then
      insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
      values (
        v_case.connection_id,p_actor_id,'issue_resolved',
        'Aspire resolved the issue with a full refund. No provider payout will be released for this payment.',
        jsonb_build_object('case_id',v_case.id,'status','resolved_refund','refund_id',p_refund_id,'refund_cents',v_amount)
      );
    end if;
  end if;

  return jsonb_build_object(
    'status','refunded','refund_id',p_refund_id,'refund_cents',v_amount,
    'connection_id',v_payment.connection_id,'duplicate',v_duplicate
  );
end;
$$;

create or replace function public.dismiss_connection_resolution_case(
  p_case_id uuid,
  p_reviewer_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.connection_resolution_cases;
  v_now timestamptz := now();
  v_note text;
begin
  if not exists (
    select 1 from public.user_roles r
    where r.user_id = p_reviewer_id and r.role in ('moderator','admin')
  ) then raise exception 'MODERATOR_ACCESS_REQUIRED'; end if;

  select * into v_case from public.connection_resolution_cases where id = p_case_id for update;
  if not found then raise exception 'RESOLUTION_CASE_NOT_FOUND'; end if;
  if v_case.status = 'dismissed' then
    return jsonb_build_object('status','dismissed','duplicate',true);
  end if;
  if v_case.status not in ('submitted','under_review') then raise exception 'RESOLUTION_CASE_ALREADY_CLOSED'; end if;

  v_note := coalesce(nullif(left(btrim(coalesce(p_note,'')),2000),''),'Case closed after Aspire review.');
  update public.connection_resolution_cases
  set status='dismissed',resolution_note=v_note,reviewed_by=p_reviewer_id,
      reviewed_at=v_now,updated_at=v_now
  where id=v_case.id;

  if not exists (
    select 1 from public.connection_events e
    where e.connection_id=v_case.connection_id
      and e.event_type='issue_resolved'
      and e.metadata ->> 'case_id'=v_case.id::text
      and e.metadata ->> 'status'='dismissed'
  ) then
    insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
    values (
      v_case.connection_id,p_reviewer_id,'issue_resolved',
      'Aspire reviewed the issue and closed the case. Payment release is no longer paused by this case.',
      jsonb_build_object('case_id',v_case.id,'status','dismissed')
    );
  end if;

  return jsonb_build_object('status','dismissed','duplicate',false);
end;
$$;

-- Approved refund requests are terminal holds. A repeat submission must return the
-- same request instead of opening a second request beside it.
create or replace function public.request_payment_refund(p_connection_id uuid, p_reason text, p_details text)
returns payment_refund_requests
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

  select * into p from public.connection_payments where connection_id=p_connection_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if auth.uid() <> p.payer_id then raise exception 'ONLY_PAYER_CAN_REQUEST_REFUND'; end if;
  if p.status not in ('secured','released') then raise exception 'REFUND_REQUEST_NOT_AVAILABLE'; end if;

  select * into r from public.payment_refund_requests
  where payment_id=p.id and requested_by=auth.uid() and status in ('open','under_review','approved')
  order by created_at desc limit 1;
  if found then return r; end if;

  anchor_ts := coalesce(p.released_at,p.paid_at,p.updated_at);
  if anchor_ts < now() - interval '7 days' then raise exception 'REFUND_REVIEW_WINDOW_CLOSED'; end if;

  insert into public.payment_refund_requests(payment_id,connection_id,requested_by,reason,details,requested_amount_cents)
  values (p.id,p.connection_id,auth.uid(),p_reason,btrim(p_details),coalesce(p.customer_total_cents,p.gross_amount_cents))
  returning * into r;
  return r;
end;
$$;

revoke all on function public.claim_connection_payment_release(uuid) from public, anon, authenticated;
revoke all on function public.claim_connection_payment_refund(uuid,uuid) from public, anon, authenticated;
revoke all on function public.clear_connection_payment_refund_claim(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.finalize_connection_payment_release(uuid,text) from public, anon, authenticated;
revoke all on function public.finalize_connection_payment_refund(uuid,text,integer,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.dismiss_connection_resolution_case(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_connection_payment_release(uuid) to service_role;
grant execute on function public.claim_connection_payment_refund(uuid,uuid) to service_role;
grant execute on function public.clear_connection_payment_refund_claim(uuid,timestamptz) to service_role;
grant execute on function public.finalize_connection_payment_release(uuid,text) to service_role;
grant execute on function public.finalize_connection_payment_refund(uuid,text,integer,uuid,uuid,text,text) to service_role;
grant execute on function public.dismiss_connection_resolution_case(uuid,uuid,text) to service_role;

revoke all on function public.request_payment_refund(uuid,text,text) from public, anon;
grant execute on function public.request_payment_refund(uuid,text,text) to authenticated;
