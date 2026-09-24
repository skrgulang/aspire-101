-- Complete the protected marketplace decision trail without representing funds
-- as legal escrow. Buyer charges remain on the platform until delivery-gated
-- release; disputes freeze the separate seller transfer.

alter table public.market_orders
  add column if not exists admin_release_authorized_at timestamptz,
  add column if not exists admin_release_authorized_by uuid,
  add column if not exists admin_release_reason text;

alter table public.market_disputes
  add column if not exists resolution_refund_cents integer,
  add column if not exists resolution_seller_release_cents integer,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists escalation_level integer not null default 0;

alter table public.market_disputes
  alter column next_action_due_at set default (now()+interval '24 hours');

alter table public.market_disputes drop constraint if exists market_disputes_status_check;
alter table public.market_disputes add constraint market_disputes_status_check
  check (status in ('open','under_review','resolved_buyer','resolved_seller','resolved_split','closed'));

alter table public.connection_payments
  add column if not exists refunded_total_cents integer not null default 0,
  add column if not exists refund_records jsonb not null default '[]'::jsonb,
  add column if not exists partially_refunded_at timestamptz;

do $$ begin
  alter table public.connection_payments add constraint connection_payments_refunded_total_nonnegative
    check (refunded_total_cents >= 0);
exception when duplicate_object then null; end $$;

create table if not exists public.market_dispute_attachments (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.market_disputes(id) on delete cascade,
  uploaded_by uuid not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  audience text not null default 'participants' check (audience in ('participants','staff')),
  created_at timestamptz not null default now()
);

create index if not exists market_dispute_attachments_thread_idx
  on public.market_dispute_attachments(dispute_id, created_at);

alter table public.market_dispute_attachments enable row level security;
revoke all on table public.market_dispute_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.market_dispute_attachments to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'market-dispute-evidence','market-dispute-evidence',false,8388608,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- No browser storage policies are created. The server checks case membership,
-- creates short-lived signed upload/read URLs, and records verified objects.

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
  if p.release_claimed_at is not null and p.release_claimed_at > now()-interval '5 minutes' then raise exception 'PAYOUT_RELEASE_IN_PROGRESS'; end if;
  if p.refund_claimed_at is not null and p.refund_claimed_at > now()-interval '5 minutes' then raise exception 'REFUND_IN_PROGRESS'; end if;
  if exists (
    select 1 from public.connection_resolution_cases c
    where c.connection_id=o.connection_id and c.status in ('submitted','under_review')
  ) then raise exception 'RESOLUTION_CASE_OPEN'; end if;

  v_claimed_at:=now();
  update public.connection_payments set refund_claimed_at=v_claimed_at, updated_at=v_claimed_at where id=p.id;
  update public.market_disputes set status='under_review', updated_at=v_claimed_at where id=d.id;

  return jsonb_build_object(
    'status','claimed','claimed_at',v_claimed_at,'payment_id',p.id,
    'connection_id',p.connection_id,
    'customer_total_cents',coalesce(p.customer_total_cents,p.gross_amount_cents),
    'refunded_total_cents',coalesce(p.refunded_total_cents,0),
    'provider_net_cents',coalesce(p.provider_net_cents,p.provider_amount_cents,0),
    'platform_fee_cents',coalesce(p.platform_fee_cents,0),
    'shipping_rate_cents',coalesce((p.fee_snapshot->>'shipping_rate_cents')::integer,0),
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
  v_total integer;
  v_before integer;
  v_after integer;
  v_remaining integer;
  v_platform_fee integer;
  v_shipping integer;
  v_seller_release integer;
  v_full boolean;
  v_order_status text;
begin
  if p_actor_id is null or not exists (
    select 1 from public.user_roles r where r.user_id=p_actor_id and r.role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_refund_id,'')),'') is null then raise exception 'REFUND_ID_REQUIRED'; end if;
  if coalesce(p_amount_cents,0)<=0 then raise exception 'REFUND_AMOUNT_INVALID'; end if;

  select * into d from public.market_disputes where id=p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;
  select * into o from public.market_orders where id=d.market_order_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  select * into p from public.connection_payments where id=p_payment_id for update;
  if not found or p.connection_id<>o.connection_id then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status='released' or p.stripe_transfer_id is not null then raise exception 'PAYOUT_ALREADY_RELEASED'; end if;
  if p.status not in ('secured','refunded') then raise exception 'PAYMENT_NOT_REFUNDABLE'; end if;

  if p.refund_records @> jsonb_build_array(jsonb_build_object('id',p_refund_id)) then
    return jsonb_build_object('status',d.status,'refund_id',p_refund_id,'duplicate',true);
  end if;

  v_total:=coalesce(p.customer_total_cents,p.gross_amount_cents,0);
  v_before:=coalesce(p.refunded_total_cents,0);
  if p_amount_cents>v_total-v_before then raise exception 'REFUND_AMOUNT_EXCEEDS_REMAINING'; end if;
  v_after:=v_before+p_amount_cents;
  v_remaining:=v_total-v_after;
  v_platform_fee:=coalesce(p.platform_fee_cents,0);
  v_shipping:=coalesce((p.fee_snapshot->>'shipping_rate_cents')::integer,0);
  v_seller_release:=greatest(0,v_remaining-v_platform_fee-v_shipping);
  v_full:=v_after=v_total;
  v_order_status:=case
    when v_full then 'refunded'
    when o.buyer_received_at is not null or o.admin_release_authorized_at is not null then 'release_ready'
    when o.seller_handed_off_at is not null then 'handoff_confirmed'
    else 'paid'
  end;

  update public.connection_payments set
    status=case when v_full then 'refunded' else 'secured' end,
    stripe_refund_id=p_refund_id,
    refunded_total_cents=v_after,
    refund_records=refund_records||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',p_refund_id,'amount_cents',p_amount_cents,'status',p_stripe_status,'created_at',v_now,'dispute_id',d.id
    ))),
    provider_net_cents=v_seller_release,
    provider_amount_cents=v_seller_release,
    refunded_at=case when v_full then coalesce(refunded_at,v_now) else refunded_at end,
    partially_refunded_at=case when not v_full then coalesce(partially_refunded_at,v_now) else partially_refunded_at end,
    refund_claimed_at=null,release_claimed_at=null,failure_reason=null,updated_at=v_now
  where id=p.id;

  update public.market_orders set
    status=v_order_status,
    refunded_at=case when v_full then coalesce(refunded_at,v_now) else refunded_at end,
    updated_at=v_now
  where id=o.id;

  update public.market_disputes set
    status=case when v_full then 'resolved_buyer' else 'resolved_split' end,
    resolution_note=coalesce(v_note,case when v_full then 'Buyer refund approved after Aspire review.' else 'Aspire approved a partial buyer refund and adjusted the seller release.' end),
    resolution_refund_cents=p_amount_cents,
    resolution_seller_release_cents=v_seller_release,
    resolved_at=coalesce(resolved_at,v_now),next_action_due_at=null,updated_at=v_now
  where id=d.id;

  if v_full then
    update public.connections set status=case when status in ('pending','confirmed','active') then 'cancelled' else status end,updated_at=v_now where id=o.connection_id;
    update public.requests set status=case when status in ('open','matched','in_progress') then 'cancelled' else status end,updated_at=v_now where id=o.request_id;
  end if;

  insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
  values (o.id,p_actor_id,'dispute_resolved',jsonb_strip_nulls(jsonb_build_object(
    'dispute_id',d.id,'outcome',case when v_full then 'buyer_refund' else 'split_refund' end,
    'stripe_refund_id',p_refund_id,'refund_cents',p_amount_cents,
    'seller_release_cents',v_seller_release,'stripe_status',p_stripe_status
  )));

  perform public.push_notification(o.buyer_id,'market_order','market-dispute-refund:'||p_refund_id,
    case when v_full then 'Marketplace refund issued' else 'Partial marketplace refund issued' end,
    case when v_full then 'Aspire approved a full refund. Bank posting time can vary.' else 'Aspire approved a partial refund. Open Resolution Center for the recorded decision.' end,
    p_actor_id,o.request_id,null,o.connection_id,null);
  perform public.push_notification(o.seller_id,'market_order','market-dispute-refund-seller:'||p_refund_id,
    'Marketplace dispute resolved',
    case when v_full then 'The buyer was refunded and no seller transfer will be released.' else 'A partial buyer refund was issued and the remaining seller release was adjusted.' end,
    p_actor_id,o.request_id,null,o.connection_id,null);

  return jsonb_build_object(
    'status',case when v_full then 'resolved_buyer' else 'resolved_split' end,
    'refund_id',p_refund_id,'refund_cents',p_amount_cents,'refunded_total_cents',v_after,
    'seller_release_cents',v_seller_release,'order_id',o.id,'connection_id',o.connection_id
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
  v_note text:=nullif(left(btrim(coalesce(p_note,'')),2000),'');
begin
  if p_actor_id is null or not exists (select 1 from public.user_roles r where r.user_id=p_actor_id and r.role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if v_note is null or char_length(v_note)<8 then raise exception 'REVIEW_NOTE_REQUIRED'; end if;
  select * into d from public.market_disputes where id=p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if d.status not in ('open','under_review') then raise exception 'DISPUTE_NOT_OPEN'; end if;
  select * into o from public.market_orders where id=d.market_order_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  select * into p from public.connection_payments where connection_id=o.connection_id for update;
  if not found or p.status<>'secured' then raise exception 'PAYMENT_NOT_SECURED'; end if;
  if p.refund_claimed_at is not null and p.refund_claimed_at>now()-interval '5 minutes' then raise exception 'REFUND_IN_PROGRESS'; end if;
  if exists (select 1 from public.connection_resolution_cases c where c.connection_id=o.connection_id and c.status in ('submitted','under_review')) then raise exception 'RESOLUTION_CASE_OPEN'; end if;

  update public.market_disputes set status='resolved_seller',resolution_note=v_note,
    resolution_refund_cents=0,resolution_seller_release_cents=coalesce(p.provider_net_cents,p.provider_amount_cents,0),
    resolved_at=v_now,next_action_due_at=null,updated_at=v_now where id=d.id;
  update public.market_orders set status='release_ready',admin_release_authorized_at=v_now,
    admin_release_authorized_by=p_actor_id,admin_release_reason=v_note,updated_at=v_now where id=o.id;
  insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
  values (o.id,p_actor_id,'dispute_resolved',jsonb_build_object('dispute_id',d.id,'outcome','seller_release_authorized','seller_release_cents',coalesce(p.provider_net_cents,p.provider_amount_cents,0)));
  perform public.push_notification(o.buyer_id,'market_order','market-dispute-seller:'||d.id::text||':'||o.buyer_id::text,
    'Marketplace dispute reviewed','Aspire reviewed the evidence and authorized the recorded seller release.',p_actor_id,o.request_id,null,o.connection_id,null);
  perform public.push_notification(o.seller_id,'market_order','market-dispute-seller:'||d.id::text||':'||o.seller_id::text,
    'Seller release authorized','Aspire reviewed the evidence and authorized the protected seller release. Normal Stripe readiness checks still apply.',p_actor_id,o.request_id,null,o.connection_id,null);
  return jsonb_build_object('status','resolved_seller','order_status','release_ready','order_id',o.id,'connection_id',o.connection_id);
end;
$$;

revoke all on function public.claim_market_dispute_refund(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finalize_market_dispute_refund(uuid,uuid,text,integer,uuid,text,text) from public,anon,authenticated;
revoke all on function public.resolve_market_dispute_for_seller(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_market_dispute_refund(uuid,uuid) to service_role;
grant execute on function public.finalize_market_dispute_refund(uuid,uuid,text,integer,uuid,text,text) to service_role;
grant execute on function public.resolve_market_dispute_for_seller(uuid,uuid,text) to service_role;

update public.market_disputes
set next_action_due_at=coalesce(next_action_due_at,created_at+interval '24 hours')
where status in ('open','under_review');

create index if not exists market_disputes_due_queue_idx
  on public.market_disputes(next_action_due_at)
  where status in ('open','under_review') and next_action_due_at is not null;

create or replace function public.touch_market_dispute_from_message()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.market_disputes
  set
    status=case when status='open' then 'under_review' else status end,
    last_participant_response_at=case when new.message_type='participant_reply' then new.created_at else last_participant_response_at end,
    last_staff_response_at=case when new.message_type='staff_reply' then new.created_at else last_staff_response_at end,
    next_action_due_at=case
      when new.message_type='participant_reply' then new.created_at+interval '12 hours'
      when new.message_type='staff_reply' then new.created_at+interval '48 hours'
      else next_action_due_at
    end,
    escalation_level=case when new.message_type in ('participant_reply','staff_reply') then 0 else escalation_level end,
    updated_at=greatest(updated_at,new.created_at)
  where id=new.dispute_id;
  return new;
end;
$$;

revoke all on function public.touch_market_dispute_from_message() from public,anon,authenticated;
grant execute on function public.touch_market_dispute_from_message() to service_role;
