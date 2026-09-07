-- Marketplace delivery is a separate campus service connection/payment.
-- Refund requests are review requests, not an automatic promise of reimbursement.

create table if not exists public.market_delivery_links (
  id uuid primary key default gen_random_uuid(),
  market_order_id uuid not null references public.market_orders(id) on delete cascade,
  delivery_request_id uuid not null unique references public.requests(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  compensation_mode text not null check (compensation_mode in ('free','fixed','discuss')),
  protection_mode text not null check (protection_mode in ('none','aspire','off_platform')),
  requested_amount_cents integer check (requested_amount_cents is null or requested_amount_cents >= 0),
  pickup_area text not null check (char_length(btrim(pickup_area)) between 2 and 180),
  dropoff_area text not null check (char_length(btrim(dropoff_area)) between 2 and 180),
  status text not null default 'active' check (status in ('active','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists market_delivery_one_active_per_order_idx
  on public.market_delivery_links(market_order_id)
  where status = 'active';
create index if not exists market_delivery_buyer_idx on public.market_delivery_links(buyer_id, created_at desc);

alter table public.market_delivery_links enable row level security;

drop policy if exists market_delivery_links_select_participants on public.market_delivery_links;
create policy market_delivery_links_select_participants on public.market_delivery_links
for select to authenticated using (
  buyer_id = auth.uid()
  or exists (
    select 1 from public.market_orders o
    where o.id = market_order_id and o.seller_id = auth.uid()
  )
  or public.is_moderator(auth.uid())
);

revoke insert, update, delete on public.market_delivery_links from authenticated;
grant select on public.market_delivery_links to authenticated;

create or replace function public.link_market_delivery_request(
  p_market_order_id uuid,
  p_delivery_request_id uuid,
  p_compensation_mode text,
  p_protection_mode text,
  p_requested_amount_cents integer,
  p_pickup_area text,
  p_dropoff_area text
)
returns public.market_delivery_links
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
  r public.requests;
  l public.market_delivery_links;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_compensation_mode not in ('free','fixed','discuss') then raise exception 'INVALID_COMPENSATION_MODE'; end if;
  if p_protection_mode not in ('none','aspire','off_platform') then raise exception 'INVALID_PROTECTION_MODE'; end if;
  if p_compensation_mode = 'free' and p_protection_mode <> 'none' then raise exception 'FREE_DELIVERY_HAS_NO_PAYMENT'; end if;
  if p_compensation_mode = 'fixed' and coalesce(p_requested_amount_cents, 0) <= 0 then raise exception 'DELIVERY_AMOUNT_REQUIRED'; end if;
  if p_compensation_mode = 'fixed' and p_protection_mode not in ('aspire','off_platform') then raise exception 'DELIVERY_PAYMENT_CHOICE_REQUIRED'; end if;
  if p_compensation_mode = 'discuss' and p_protection_mode <> 'none' then raise exception 'DISCUSS_PAYMENT_AFTER_MATCH'; end if;

  select * into o from public.market_orders where id = p_market_order_id;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if o.buyer_id <> auth.uid() then raise exception 'NOT_BUYER'; end if;
  if o.status in ('released','refunded','cancelled') then raise exception 'MARKET_ORDER_CLOSED'; end if;

  select * into r from public.requests where id = p_delivery_request_id;
  if not found then raise exception 'DELIVERY_REQUEST_NOT_FOUND'; end if;
  if r.poster_id <> auth.uid() then raise exception 'NOT_REQUEST_OWNER'; end if;
  if r.category <> 'Pickup / errand' then raise exception 'DELIVERY_REQUEST_CATEGORY_REQUIRED'; end if;

  insert into public.market_delivery_links(
    market_order_id, delivery_request_id, buyer_id, compensation_mode, protection_mode,
    requested_amount_cents, pickup_area, dropoff_area
  ) values (
    o.id, r.id, auth.uid(), p_compensation_mode, p_protection_mode,
    case when p_compensation_mode = 'fixed' then p_requested_amount_cents else null end,
    btrim(p_pickup_area), btrim(p_dropoff_area)
  ) returning * into l;

  return l;
end;
$$;

create or replace function public.cancel_market_delivery_request(p_delivery_link_id uuid)
returns public.market_delivery_links
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.market_delivery_links;
begin
  select * into l from public.market_delivery_links where id = p_delivery_link_id for update;
  if not found then raise exception 'DELIVERY_LINK_NOT_FOUND'; end if;
  if auth.uid() is null or auth.uid() <> l.buyer_id then raise exception 'NOT_BUYER'; end if;
  if l.status <> 'active' then return l; end if;

  if exists (select 1 from public.connections c where c.request_id = l.delivery_request_id and c.status not in ('cancelled')) then
    raise exception 'DELIVERY_ALREADY_CONNECTED';
  end if;

  update public.market_delivery_links set status = 'cancelled', updated_at = now() where id = l.id returning * into l;
  update public.requests set status = 'cancelled', updated_at = now() where id = l.delivery_request_id and poster_id = auth.uid() and status = 'open';
  return l;
end;
$$;

revoke all on function public.link_market_delivery_request(uuid,uuid,text,text,integer,text,text) from public;
revoke all on function public.cancel_market_delivery_request(uuid) from public;
grant execute on function public.link_market_delivery_request(uuid,uuid,text,text,integer,text,text) to authenticated, service_role;
grant execute on function public.cancel_market_delivery_request(uuid) to authenticated, service_role;

create table if not exists public.connection_payment_agreements (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text not null check (payment_method in ('aspire','in_person')),
  proposed_by uuid not null references auth.users(id) on delete cascade,
  requester_accepted_at timestamptz,
  responder_accepted_at timestamptz,
  status text not null default 'proposed' check (status in ('proposed','agreed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connection_payment_agreements enable row level security;
drop policy if exists connection_payment_agreements_participants on public.connection_payment_agreements;
create policy connection_payment_agreements_participants on public.connection_payment_agreements
for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_id and auth.uid() in (c.requester_id, c.responder_id)
  )
  or public.is_moderator(auth.uid())
);
revoke insert, update, delete on public.connection_payment_agreements from authenticated;
grant select on public.connection_payment_agreements to authenticated;

create or replace function public.propose_connection_payment_terms(
  p_connection_id uuid,
  p_amount_cents integer,
  p_payment_method text
)
returns public.connection_payment_agreements
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.connections;
  p public.connection_payments;
  a public.connection_payment_agreements;
  now_ts timestamptz := now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'POSITIVE_AMOUNT_REQUIRED'; end if;
  if p_payment_method not in ('aspire','in_person') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  select * into c from public.connections where id = p_connection_id for update;
  if not found then raise exception 'CONNECTION_NOT_FOUND'; end if;
  if auth.uid() not in (c.requester_id, c.responder_id) then raise exception 'NOT_PARTICIPANT'; end if;
  if c.status not in ('pending','confirmed','active') then raise exception 'CONNECTION_TERMS_CLOSED'; end if;

  select * into p from public.connection_payments where connection_id = c.id;
  if p.id is not null and p.status in ('secured','released','refunded','disputed') then raise exception 'PAYMENT_ALREADY_LOCKED'; end if;

  insert into public.connection_payment_agreements(
    connection_id, amount_cents, payment_method, proposed_by,
    requester_accepted_at, responder_accepted_at, status
  ) values (
    c.id, p_amount_cents, p_payment_method, auth.uid(),
    case when auth.uid() = c.requester_id then now_ts else null end,
    case when auth.uid() = c.responder_id then now_ts else null end,
    'proposed'
  )
  on conflict (connection_id) do update set
    amount_cents = excluded.amount_cents,
    payment_method = excluded.payment_method,
    proposed_by = excluded.proposed_by,
    requester_accepted_at = excluded.requester_accepted_at,
    responder_accepted_at = excluded.responder_accepted_at,
    status = 'proposed',
    updated_at = now_ts
  returning * into a;

  return a;
end;
$$;

create or replace function public.accept_connection_payment_terms(p_connection_id uuid)
returns public.connection_payment_agreements
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.connections;
  a public.connection_payment_agreements;
  now_ts timestamptz := now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.connections where id = p_connection_id for update;
  if not found then raise exception 'CONNECTION_NOT_FOUND'; end if;
  if auth.uid() not in (c.requester_id, c.responder_id) then raise exception 'NOT_PARTICIPANT'; end if;
  if c.status not in ('pending','confirmed','active') then raise exception 'CONNECTION_TERMS_CLOSED'; end if;

  select * into a from public.connection_payment_agreements where connection_id = c.id for update;
  if not found or a.status <> 'proposed' then raise exception 'NO_TERMS_TO_ACCEPT'; end if;

  update public.connection_payment_agreements set
    requester_accepted_at = case when auth.uid() = c.requester_id then coalesce(requester_accepted_at, now_ts) else requester_accepted_at end,
    responder_accepted_at = case when auth.uid() = c.responder_id then coalesce(responder_accepted_at, now_ts) else responder_accepted_at end,
    updated_at = now_ts
  where connection_id = c.id returning * into a;

  if a.requester_accepted_at is not null and a.responder_accepted_at is not null then
    update public.connection_payment_agreements set status = 'agreed', updated_at = now_ts where connection_id = c.id returning * into a;
    update public.connections set
      agreed_amount_cents = a.amount_cents,
      payment_method = a.payment_method,
      agreed_terms = coalesce(agreed_terms, '{}'::jsonb) || jsonb_build_object(
        'payment_terms_agreed_at', now_ts,
        'payment_terms_method', a.payment_method,
        'payment_terms_amount_cents', a.amount_cents
      ),
      updated_at = now_ts
    where id = c.id;
  end if;

  return a;
end;
$$;

revoke all on function public.propose_connection_payment_terms(uuid,integer,text) from public;
revoke all on function public.accept_connection_payment_terms(uuid) from public;
grant execute on function public.propose_connection_payment_terms(uuid,integer,text) to authenticated, service_role;
grant execute on function public.accept_connection_payment_terms(uuid) to authenticated, service_role;

create table if not exists public.payment_refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.connection_payments(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('not_received','not_as_described','service_not_completed','wrong_charge','unsafe_or_cancelled','other')),
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  requested_amount_cents integer,
  status text not null default 'open' check (status in ('open','under_review','approved','denied','processed')),
  resolution_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_refund_one_open_idx
  on public.payment_refund_requests(payment_id, requested_by)
  where status in ('open','under_review');
create index if not exists payment_refund_status_idx on public.payment_refund_requests(status, created_at);

alter table public.payment_refund_requests enable row level security;
drop policy if exists payment_refund_select_participants on public.payment_refund_requests;
create policy payment_refund_select_participants on public.payment_refund_requests
for select to authenticated using (
  exists (
    select 1 from public.connection_payments p
    where p.id = payment_id and auth.uid() in (p.payer_id, p.payee_id)
  )
  or public.is_moderator(auth.uid())
);
revoke insert, update, delete on public.payment_refund_requests from authenticated;
grant select on public.payment_refund_requests to authenticated;

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

  select * into p from public.connection_payments where connection_id = p_connection_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if auth.uid() <> p.payer_id then raise exception 'ONLY_PAYER_CAN_REQUEST_REFUND'; end if;
  if p.status not in ('secured','released') then raise exception 'REFUND_REQUEST_NOT_AVAILABLE'; end if;

  anchor_ts := coalesce(p.released_at, p.paid_at, p.updated_at);
  if anchor_ts < now() - interval '7 days' then raise exception 'REFUND_REVIEW_WINDOW_CLOSED'; end if;

  insert into public.payment_refund_requests(
    payment_id, connection_id, requested_by, reason, details, requested_amount_cents
  ) values (
    p.id, p.connection_id, auth.uid(), p_reason, btrim(p_details),
    coalesce(p.customer_total_cents, p.gross_amount_cents)
  ) returning * into r;

  return r;
end;
$$;

revoke all on function public.request_payment_refund(uuid,text,text) from public;
grant execute on function public.request_payment_refund(uuid,text,text) to authenticated, service_role;

create or replace function public.sync_market_delivery_link_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    update public.market_delivery_links set status = 'cancelled', updated_at = now()
    where delivery_request_id = new.id and status = 'active';
  elsif new.status = 'completed' then
    update public.market_delivery_links set status = 'completed', updated_at = now()
    where delivery_request_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_market_delivery_link_status() from public, anon, authenticated;
grant execute on function public.sync_market_delivery_link_status() to service_role;

drop trigger if exists trg_sync_market_delivery_link_status on public.requests;
create trigger trg_sync_market_delivery_link_status
after update of status on public.requests
for each row execute function public.sync_market_delivery_link_status();

comment on table public.market_delivery_links is 'Links a marketplace purchase to an optional, separate campus delivery request. Item and delivery remain separate transactions.';
comment on table public.connection_payment_agreements is 'Two-party agreement for an amount and protected/off-platform payment choice when compensation is decided after matching.';
comment on table public.payment_refund_requests is 'User refund review requests. Approval is not automatic and does not imply legal escrow or insurance.';
