-- Aspire 101 Flexible Fulfillment System.
-- Adds multi-method marketplace fulfillment plus a privacy-first Aspirer delivery/errand workflow.
-- Paid delivery rewards are separate protected connections; free delivery never enters Stripe.

alter table public.requests
  add column if not exists fulfillment_methods text[] not null default '{}'::text[];

update public.requests
set fulfillment_methods = array[coalesce(fulfillment_method, 'campus_pickup')]
where kind = 'buy_sell'
  and cardinality(fulfillment_methods) = 0;

alter table public.requests drop constraint if exists requests_fulfillment_method_check;
alter table public.requests add constraint requests_fulfillment_method_check
  check (fulfillment_method is null or fulfillment_method in ('campus_pickup','shipping','aspirer_delivery'));

alter table public.requests drop constraint if exists requests_fulfillment_methods_check;
alter table public.requests add constraint requests_fulfillment_methods_check
  check (
    kind <> 'buy_sell'
    or (
      cardinality(fulfillment_methods) >= 1
      and fulfillment_methods <@ array['campus_pickup','shipping','aspirer_delivery']::text[]
    )
  );

create or replace function public.sync_request_fulfillment_methods()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'buy_sell' then
    if new.fulfillment_methods is null or cardinality(new.fulfillment_methods) = 0 then
      new.fulfillment_methods := array[coalesce(new.fulfillment_method, 'campus_pickup')];
    end if;
    if new.fulfillment_method is null or not (new.fulfillment_method = any(new.fulfillment_methods)) then
      new.fulfillment_method := new.fulfillment_methods[1];
    end if;
  else
    new.fulfillment_methods := coalesce(new.fulfillment_methods, '{}'::text[]);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_request_fulfillment_methods on public.requests;
create trigger trg_sync_request_fulfillment_methods
before insert or update of kind, fulfillment_method, fulfillment_methods on public.requests
for each row execute function public.sync_request_fulfillment_methods();

alter table public.market_orders drop constraint if exists market_orders_fulfillment_method_check;
alter table public.market_orders add constraint market_orders_fulfillment_method_check
  check (fulfillment_method in ('campus_pickup','shipping','aspirer_delivery'));

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests(id) on delete cascade,
  market_order_id uuid unique references public.market_orders(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  pickup_party_id uuid references auth.users(id) on delete set null,
  dropoff_party_id uuid references auth.users(id) on delete set null,
  matched_aspirer_id uuid references auth.users(id) on delete set null,
  connection_id uuid unique references public.connections(id) on delete set null,
  campus_id uuid not null,
  pickup_area text not null check (char_length(btrim(pickup_area)) between 2 and 160),
  dropoff_area text not null check (char_length(btrim(dropoff_area)) between 2 and 160),
  approx_distance_miles numeric(6,2) check (approx_distance_miles is null or approx_distance_miles >= 0),
  preferred_at timestamptz,
  reward_mode text not null check (reward_mode in ('free','fixed','negotiable')),
  reward_cents integer check (reward_cents is null or reward_cents >= 0),
  agreed_reward_cents integer check (agreed_reward_cents is null or agreed_reward_cents >= 0),
  status text not null default 'looking_for_aspirer' check (status in (
    'looking_for_aspirer','offer_received','matched','heading_to_pickup','picked_up',
    'on_the_way','delivered','completed','cancelled'
  )),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (reward_mode = 'free' and coalesce(reward_cents, 0) = 0)
    or (reward_mode = 'fixed' and reward_cents is not null and reward_cents > 0)
    or reward_mode = 'negotiable'
  )
);

create table if not exists public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  delivery_job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  aspirer_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending','countered','accepted','declined','withdrawn')),
  last_actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_job_id, aspirer_id)
);

create table if not exists public.delivery_private_locations (
  delivery_job_id uuid primary key references public.delivery_jobs(id) on delete cascade,
  pickup_instructions text,
  dropoff_instructions text,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_confirmation_secrets (
  delivery_job_id uuid primary key references public.delivery_jobs(id) on delete cascade,
  pickup_code char(4) not null,
  delivery_code char(4) not null,
  pickup_attempts integer not null default 0,
  delivery_attempts integer not null default 0,
  pickup_used_at timestamptz,
  delivery_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists delivery_jobs_campus_status_idx on public.delivery_jobs(campus_id, status, created_at desc);
create index if not exists delivery_jobs_requester_idx on public.delivery_jobs(requester_id, created_at desc);
create index if not exists delivery_jobs_aspirer_idx on public.delivery_jobs(matched_aspirer_id, updated_at desc);
create index if not exists delivery_offers_job_idx on public.delivery_offers(delivery_job_id, updated_at desc);
create index if not exists delivery_offers_aspirer_idx on public.delivery_offers(aspirer_id, updated_at desc);

alter table public.delivery_jobs enable row level security;
alter table public.delivery_offers enable row level security;
alter table public.delivery_private_locations enable row level security;
alter table public.delivery_confirmation_secrets enable row level security;

revoke all on public.delivery_jobs, public.delivery_offers, public.delivery_private_locations, public.delivery_confirmation_secrets from anon, authenticated;
grant select on public.delivery_jobs, public.delivery_offers to authenticated;
grant all on public.delivery_jobs, public.delivery_offers, public.delivery_private_locations, public.delivery_confirmation_secrets to service_role;

drop policy if exists delivery_jobs_visible on public.delivery_jobs;
create policy delivery_jobs_visible on public.delivery_jobs for select to authenticated
using (
  auth.uid() = requester_id
  or auth.uid() = pickup_party_id
  or auth.uid() = dropoff_party_id
  or auth.uid() = matched_aspirer_id
  or public.is_admin()
  or exists (
    select 1 from public.requests r
    where r.id = request_id
      and r.moderation_status = 'approved'
      and r.status = 'open'
  )
);

drop policy if exists delivery_offers_visible on public.delivery_offers;
create policy delivery_offers_visible on public.delivery_offers for select to authenticated
using (
  auth.uid() = aspirer_id
  or public.is_admin()
  or exists (
    select 1 from public.delivery_jobs j
    where j.id = delivery_job_id
      and (auth.uid() = j.requester_id or auth.uid() = j.matched_aspirer_id)
  )
);

create or replace function public.delivery_helper_is_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
      and u.phone_confirmed_at is not null
  );
$$;

create or replace function public.delivery_new_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select lpad((floor(random() * 10000))::integer::text, 4, '0');
$$;

create or replace function public.create_delivery_job_for_request(
  p_request_id uuid,
  p_pickup_area text,
  p_dropoff_area text,
  p_preferred_at timestamptz default null,
  p_reward_mode text default 'free',
  p_reward_cents integer default null,
  p_pickup_instructions text default null,
  p_dropoff_instructions text default null,
  p_approx_distance_miles numeric default null
)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests%rowtype;
  j public.delivery_jobs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_user_interact(auth.uid()) then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if p_reward_mode not in ('free','fixed','negotiable') then raise exception 'INVALID_REWARD_MODE'; end if;
  if p_preferred_at is not null and p_preferred_at <= now() then raise exception 'PREFERRED_TIME_IN_PAST'; end if;
  if p_approx_distance_miles is not null and p_approx_distance_miles < 0 then raise exception 'INVALID_DISTANCE'; end if;

  select * into r from public.requests where id = p_request_id for update;
  if not found or r.poster_id <> auth.uid() then raise exception 'REQUEST_NOT_OWNED'; end if;
  if r.status <> 'open' then raise exception 'REQUEST_NOT_OPEN'; end if;
  if r.moderation_status <> 'approved' then raise exception 'REQUEST_NOT_APPROVED'; end if;

  if p_reward_mode = 'fixed' then
    if p_reward_cents is null or p_reward_cents <= 0 then raise exception 'INVALID_REWARD'; end if;
    if r.kind <> 'paid_help' or r.amount_cents is distinct from p_reward_cents or r.payment_method is distinct from 'aspire' then
      raise exception 'PAID_DELIVERY_REQUIRES_ASPIRE';
    end if;
  else
    if r.kind <> 'community' or r.amount_cents is not null or r.payment_method is distinct from 'none' then
      raise exception 'FREE_OR_NEGOTIABLE_DELIVERY_MUST_START_FREE';
    end if;
  end if;

  insert into public.delivery_jobs(
    request_id, requester_id, pickup_party_id, dropoff_party_id, campus_id,
    pickup_area, dropoff_area, approx_distance_miles, preferred_at, reward_mode, reward_cents
  ) values (
    r.id, r.poster_id, r.poster_id, r.poster_id, r.campus_id,
    btrim(p_pickup_area), btrim(p_dropoff_area), p_approx_distance_miles, p_preferred_at,
    p_reward_mode, case when p_reward_mode = 'fixed' then p_reward_cents when p_reward_mode = 'free' then 0 else null end
  ) returning * into j;

  insert into public.delivery_private_locations(delivery_job_id, pickup_instructions, dropoff_instructions)
  values (j.id, nullif(btrim(p_pickup_instructions), ''), nullif(btrim(p_dropoff_instructions), ''));

  insert into public.delivery_confirmation_secrets(delivery_job_id, pickup_code, delivery_code)
  values (j.id, public.delivery_new_code(), public.delivery_new_code());

  return j;
end;
$$;

create or replace function public.delivery_make_offer(
  p_delivery_job_id uuid,
  p_amount_cents integer default 0,
  p_message text default null
)
returns public.delivery_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  o public.delivery_offers;
  r public.requests%rowtype;
  v_amount integer := coalesce(p_amount_cents, 0);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_user_interact(auth.uid()) then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if not public.delivery_helper_is_verified(auth.uid()) then raise exception 'VERIFY_EMAIL_AND_PHONE'; end if;

  select * into j from public.delivery_jobs where id = p_delivery_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if j.status not in ('looking_for_aspirer','offer_received') then raise exception 'DELIVERY_NOT_AVAILABLE'; end if;
  if auth.uid() = j.requester_id or auth.uid() = j.pickup_party_id or auth.uid() = j.dropoff_party_id then
    raise exception 'CANNOT_SELF_DELIVER';
  end if;

  select * into r from public.requests where id = j.request_id;
  if r.moderation_status <> 'approved' or r.status <> 'open' then raise exception 'DELIVERY_NOT_AVAILABLE'; end if;

  if j.reward_mode = 'free' and v_amount <> 0 then raise exception 'FREE_DELIVERY_REWARD'; end if;
  if j.reward_mode = 'fixed' and v_amount <> j.reward_cents then raise exception 'FIXED_REWARD_MISMATCH'; end if;
  if v_amount < 0 then raise exception 'INVALID_REWARD'; end if;

  insert into public.delivery_offers(delivery_job_id, aspirer_id, amount_cents, message, status, last_actor_id)
  values (j.id, auth.uid(), v_amount, nullif(btrim(p_message), ''), 'pending', auth.uid())
  on conflict (delivery_job_id, aspirer_id) do update set
    amount_cents = excluded.amount_cents,
    message = excluded.message,
    status = 'pending',
    last_actor_id = excluded.last_actor_id,
    updated_at = now()
  returning * into o;

  update public.delivery_jobs
  set status = 'offer_received', updated_at = now()
  where id = j.id;

  return o;
end;
$$;

create or replace function public.delivery_counter_offer(p_offer_id uuid, p_amount_cents integer)
returns public.delivery_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.delivery_offers;
  j public.delivery_jobs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount_cents < 0 then raise exception 'INVALID_REWARD'; end if;
  select * into o from public.delivery_offers where id = p_offer_id for update;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into j from public.delivery_jobs where id = o.delivery_job_id for update;
  if j.requester_id <> auth.uid() then raise exception 'NOT_REQUESTER'; end if;
  if j.reward_mode <> 'negotiable' then raise exception 'REWARD_NOT_NEGOTIABLE'; end if;
  if j.status <> 'offer_received' or o.status not in ('pending','countered') then raise exception 'OFFER_NOT_ACTIVE'; end if;

  update public.delivery_offers
  set amount_cents = p_amount_cents,
      status = 'countered',
      last_actor_id = auth.uid(),
      updated_at = now()
  where id = o.id
  returning * into o;
  return o;
end;
$$;

create or replace function public.delivery_accept_offer(p_offer_id uuid)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.delivery_offers;
  j public.delivery_jobs;
  r public.requests%rowtype;
  v_connection_id uuid;
  v_amount integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_user_interact(auth.uid()) then raise exception 'ACCOUNT_RESTRICTED'; end if;

  select * into o from public.delivery_offers where id = p_offer_id for update;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into j from public.delivery_jobs where id = o.delivery_job_id for update;
  if j.status <> 'offer_received' or o.status not in ('pending','countered') then raise exception 'OFFER_NOT_ACTIVE'; end if;

  if o.last_actor_id = j.requester_id then
    if auth.uid() <> o.aspirer_id then raise exception 'WAITING_FOR_ASPIRER'; end if;
  elsif o.last_actor_id = o.aspirer_id then
    if auth.uid() <> j.requester_id then raise exception 'WAITING_FOR_REQUESTER'; end if;
  else
    raise exception 'INVALID_OFFER_STATE';
  end if;

  select * into r from public.requests where id = j.request_id for update;
  if r.moderation_status <> 'approved' or r.status <> 'open' then raise exception 'DELIVERY_NOT_AVAILABLE'; end if;
  v_amount := o.amount_cents;

  if v_amount > 0 then
    update public.requests
    set kind = 'paid_help', amount_cents = v_amount, payment_method = 'aspire', updated_at = now()
    where id = r.id;
  else
    update public.requests
    set kind = 'community', amount_cents = null, payment_method = 'none', updated_at = now()
    where id = r.id;
  end if;

  insert into public.connections(
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, payment_method, agreed_terms
  ) values (
    r.id, j.requester_id, o.aspirer_id, true, true, 'active',
    case when v_amount > 0 then v_amount else null end,
    case when v_amount > 0 then 'aspire' else 'none' end,
    jsonb_build_object('source','aspirer_delivery','delivery_job_id',j.id,'reward_mode',j.reward_mode)
  ) returning id into v_connection_id;

  update public.requests set status = 'matched', updated_at = now() where id = r.id;
  update public.delivery_offers
  set status = case when id = o.id then 'accepted' else 'declined' end,
      updated_at = now()
  where delivery_job_id = j.id and status in ('pending','countered');

  update public.delivery_jobs
  set matched_aspirer_id = o.aspirer_id,
      connection_id = v_connection_id,
      agreed_reward_cents = v_amount,
      status = 'matched',
      updated_at = now()
  where id = j.id
  returning * into j;

  return j;
end;
$$;

create or replace function public.delivery_set_status(p_delivery_job_id uuid, p_next_status text)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into j from public.delivery_jobs where id = p_delivery_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.matched_aspirer_id then raise exception 'NOT_MATCHED_ASPIRER'; end if;

  if not (
    (j.status = 'matched' and p_next_status = 'heading_to_pickup')
    or (j.status = 'picked_up' and p_next_status = 'on_the_way')
  ) then
    raise exception 'INVALID_DELIVERY_TRANSITION';
  end if;

  update public.delivery_jobs
  set status = p_next_status, updated_at = now()
  where id = j.id
  returning * into j;
  return j;
end;
$$;

create or replace function public.delivery_get_confirmation_code(p_delivery_job_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  s public.delivery_confirmation_secrets;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind not in ('pickup','delivery') then raise exception 'INVALID_CONFIRMATION_KIND'; end if;
  select * into j from public.delivery_jobs where id = p_delivery_job_id;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  select * into s from public.delivery_confirmation_secrets where delivery_job_id = j.id;

  if p_kind = 'pickup' then
    if auth.uid() <> j.pickup_party_id then raise exception 'NOT_PICKUP_PARTY'; end if;
    return s.pickup_code;
  end if;

  if auth.uid() <> j.dropoff_party_id then raise exception 'NOT_DROPOFF_PARTY'; end if;
  return s.delivery_code;
end;
$$;

create or replace function public.delivery_verify_confirmation_code(
  p_delivery_job_id uuid,
  p_kind text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  s public.delivery_confirmation_secrets;
  v_code text := btrim(coalesce(p_code, ''));
  v_attempts integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind not in ('pickup','delivery') then raise exception 'INVALID_CONFIRMATION_KIND'; end if;
  if v_code !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'error','INVALID_CODE_FORMAT'); end if;

  select * into j from public.delivery_jobs where id = p_delivery_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.matched_aspirer_id then raise exception 'NOT_MATCHED_ASPIRER'; end if;
  select * into s from public.delivery_confirmation_secrets where delivery_job_id = j.id for update;

  if p_kind = 'pickup' then
    if s.pickup_used_at is not null then return jsonb_build_object('ok',true,'status',j.status); end if;
    if j.status not in ('matched','heading_to_pickup') then raise exception 'INVALID_DELIVERY_TRANSITION'; end if;
    if s.pickup_attempts >= 8 then return jsonb_build_object('ok',false,'error','CODE_LOCKED'); end if;
    if s.pickup_code <> v_code then
      update public.delivery_confirmation_secrets set pickup_attempts = pickup_attempts + 1 where delivery_job_id = j.id;
      v_attempts := s.pickup_attempts + 1;
      return jsonb_build_object('ok',false,'error','INVALID_CODE','attempts_remaining',greatest(0,8-v_attempts));
    end if;
    update public.delivery_confirmation_secrets set pickup_used_at = now() where delivery_job_id = j.id;
    update public.delivery_jobs set status = 'picked_up', picked_up_at = now(), updated_at = now() where id = j.id returning * into j;
    return jsonb_build_object('ok',true,'status',j.status);
  end if;

  if s.delivery_used_at is not null then return jsonb_build_object('ok',true,'status',j.status); end if;
  if j.status not in ('picked_up','on_the_way') then raise exception 'INVALID_DELIVERY_TRANSITION'; end if;
  if s.delivery_attempts >= 8 then return jsonb_build_object('ok',false,'error','CODE_LOCKED'); end if;
  if s.delivery_code <> v_code then
    update public.delivery_confirmation_secrets set delivery_attempts = delivery_attempts + 1 where delivery_job_id = j.id;
    v_attempts := s.delivery_attempts + 1;
    return jsonb_build_object('ok',false,'error','INVALID_CODE','attempts_remaining',greatest(0,8-v_attempts));
  end if;
  update public.delivery_confirmation_secrets set delivery_used_at = now() where delivery_job_id = j.id;
  update public.delivery_jobs set status = 'delivered', delivered_at = now(), updated_at = now() where id = j.id returning * into j;
  return jsonb_build_object('ok',true,'status',j.status);
end;
$$;

create or replace function public.delivery_complete(p_delivery_job_id uuid)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into j from public.delivery_jobs where id = p_delivery_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.requester_id and auth.uid() <> j.dropoff_party_id then raise exception 'NOT_DROPOFF_PARTY'; end if;
  if j.status <> 'delivered' then raise exception 'DELIVERY_NOT_DELIVERED'; end if;

  update public.delivery_jobs
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = j.id
  returning * into j;
  return j;
end;
$$;

create or replace function public.delivery_set_private_locations(
  p_delivery_job_id uuid,
  p_pickup_instructions text default null,
  p_dropoff_instructions text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into j from public.delivery_jobs where id = p_delivery_job_id;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.requester_id and auth.uid() <> j.pickup_party_id and auth.uid() <> j.dropoff_party_id then
    raise exception 'NOT_DELIVERY_PARTICIPANT';
  end if;
  if j.status in ('completed','cancelled') then raise exception 'DELIVERY_CLOSED'; end if;

  insert into public.delivery_private_locations(delivery_job_id, pickup_instructions, dropoff_instructions, updated_at)
  values (j.id, nullif(btrim(p_pickup_instructions), ''), nullif(btrim(p_dropoff_instructions), ''), now())
  on conflict (delivery_job_id) do update set
    pickup_instructions = coalesce(excluded.pickup_instructions, public.delivery_private_locations.pickup_instructions),
    dropoff_instructions = coalesce(excluded.dropoff_instructions, public.delivery_private_locations.dropoff_instructions),
    updated_at = now();
end;
$$;

create or replace function public.delivery_get_private_locations(p_delivery_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  l public.delivery_private_locations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into j from public.delivery_jobs where id = p_delivery_job_id;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if j.status in ('looking_for_aspirer','offer_received') then raise exception 'PRIVATE_LOCATION_LOCKED_UNTIL_MATCH'; end if;
  if auth.uid() <> j.requester_id and auth.uid() <> j.pickup_party_id and auth.uid() <> j.dropoff_party_id and auth.uid() <> j.matched_aspirer_id then
    raise exception 'NOT_DELIVERY_PARTICIPANT';
  end if;
  select * into l from public.delivery_private_locations where delivery_job_id = j.id;
  return jsonb_build_object('pickup_instructions',l.pickup_instructions,'dropoff_instructions',l.dropoff_instructions);
end;
$$;

-- The marketplace chooser uses a new RPC so the pre-existing one-argument Buy Now RPC remains backward-compatible.
create or replace function public.purchase_marketplace_listing_flexible(
  p_request_id uuid,
  p_fulfillment_method text,
  p_pickup_area text default null,
  p_dropoff_area text default null,
  p_reward_mode text default null,
  p_reward_cents integer default null,
  p_preferred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.requests%rowtype;
  v_connection_id uuid;
  v_market_order_id uuid;
  v_delivery_request_id uuid;
  v_delivery_job_id uuid;
  v_delivery_kind text;
  v_delivery_payment text;
  v_reward_mode text;
  v_reward_cents integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_user_interact(auth.uid()) then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if p_fulfillment_method not in ('campus_pickup','shipping','aspirer_delivery') then raise exception 'INVALID_FULFILLMENT_METHOD'; end if;

  select * into v_listing from public.requests where id = p_request_id for update;
  if not found
     or v_listing.kind <> 'buy_sell'
     or v_listing.market_intent <> 'sell'
     or v_listing.status <> 'open'
     or v_listing.moderation_status <> 'approved'
     or v_listing.amount_cents is null
     or v_listing.amount_cents <= 0
     or v_listing.payment_method is distinct from 'aspire'
  then
    raise exception 'LISTING_UNAVAILABLE';
  end if;
  if v_listing.poster_id = auth.uid() then raise exception 'CANNOT_BUY_OWN_LISTING'; end if;
  if v_listing.listing_expires_at is not null and v_listing.listing_expires_at <= now() then raise exception 'LISTING_EXPIRED'; end if;
  if not (p_fulfillment_method = any(v_listing.fulfillment_methods)) then raise exception 'FULFILLMENT_UNAVAILABLE'; end if;

  if p_fulfillment_method = 'aspirer_delivery' then
    if char_length(btrim(coalesce(p_pickup_area,''))) < 2 or char_length(btrim(coalesce(p_dropoff_area,''))) < 2 then
      raise exception 'DELIVERY_AREAS_REQUIRED';
    end if;
    v_reward_mode := coalesce(p_reward_mode, 'free');
    if v_reward_mode not in ('free','fixed','negotiable') then raise exception 'INVALID_REWARD_MODE'; end if;
    if v_reward_mode = 'fixed' then
      if p_reward_cents is null or p_reward_cents <= 0 then raise exception 'INVALID_REWARD'; end if;
      v_reward_cents := p_reward_cents;
      v_delivery_kind := 'paid_help';
      v_delivery_payment := 'aspire';
    elsif v_reward_mode = 'free' then
      v_reward_cents := 0;
      v_delivery_kind := 'community';
      v_delivery_payment := 'none';
    else
      v_reward_cents := null;
      v_delivery_kind := 'community';
      v_delivery_payment := 'none';
    end if;
    if p_preferred_at is not null and p_preferred_at <= now() then raise exception 'PREFERRED_TIME_IN_PAST'; end if;
  end if;

  insert into public.connections(
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, payment_method, agreed_terms
  ) values (
    v_listing.id, v_listing.poster_id, auth.uid(), true, true, 'active',
    v_listing.amount_cents, 'aspire',
    jsonb_build_object(
      'source','marketplace_flexible_checkout',
      'market_intent',v_listing.market_intent,
      'price_negotiable',v_listing.price_negotiable,
      'fulfillment_method',p_fulfillment_method
    )
  ) returning id into v_connection_id;

  update public.requests set status = 'matched', updated_at = now()
  where id = v_listing.id and status = 'open';
  if not found then raise exception 'LISTING_UNAVAILABLE'; end if;

  select id into v_market_order_id from public.market_orders where connection_id = v_connection_id;

  if p_fulfillment_method = 'aspirer_delivery' then
    insert into public.requests(
      poster_id, kind, category, title, details, campus_id, amount_cents, currency,
      payment_method, status, language_code
    ) values (
      auth.uid(), v_delivery_kind, 'Delivery / Errand',
      'Delivery help for a marketplace order',
      concat('Pickup area: ', btrim(p_pickup_area), E'\nDrop-off area: ', btrim(p_dropoff_area)),
      v_listing.campus_id,
      case when v_delivery_kind = 'paid_help' then v_reward_cents else null end,
      coalesce(v_listing.currency, 'USD'), v_delivery_payment, 'open', coalesce(v_listing.language_code, 'en')
    ) returning id into v_delivery_request_id;

    insert into public.delivery_jobs(
      request_id, market_order_id, requester_id, pickup_party_id, dropoff_party_id,
      campus_id, pickup_area, dropoff_area, preferred_at, reward_mode, reward_cents
    ) values (
      v_delivery_request_id, v_market_order_id, auth.uid(), v_listing.poster_id, auth.uid(),
      v_listing.campus_id, btrim(p_pickup_area), btrim(p_dropoff_area), p_preferred_at,
      v_reward_mode, v_reward_cents
    ) returning id into v_delivery_job_id;

    insert into public.delivery_private_locations(delivery_job_id) values (v_delivery_job_id);
    insert into public.delivery_confirmation_secrets(delivery_job_id, pickup_code, delivery_code)
    values (v_delivery_job_id, public.delivery_new_code(), public.delivery_new_code());
  end if;

  return jsonb_build_object(
    'connection_id',v_connection_id,
    'market_order_id',v_market_order_id,
    'delivery_job_id',v_delivery_job_id,
    'delivery_request_id',v_delivery_request_id,
    'fulfillment_method',p_fulfillment_method
  );
end;
$$;

-- A selected buyer method is stored in connection terms and becomes the order method.
create or replace function public.ensure_market_order_for_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests%rowtype;
  v_buyer uuid;
  v_seller uuid;
  v_amount integer;
  v_status text;
  v_fulfillment text;
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
  v_status := case when coalesce(new.payment_method, r.payment_method, 'none') = 'aspire' then 'awaiting_payment' else 'off_platform' end;
  v_fulfillment := coalesce(nullif(new.agreed_terms->>'fulfillment_method',''), r.fulfillment_method, 'campus_pickup');
  if v_fulfillment not in ('campus_pickup','shipping','aspirer_delivery') then v_fulfillment := 'campus_pickup'; end if;

  insert into public.market_orders(
    connection_id, request_id, buyer_id, seller_id, listing_intent,
    fulfillment_method, currency, agreed_amount_cents, status
  ) values (
    new.id, r.id, v_buyer, v_seller, r.market_intent,
    v_fulfillment, coalesce(r.currency, 'USD'), v_amount, v_status
  )
  on conflict (connection_id) do update set
    buyer_id = excluded.buyer_id,
    seller_id = excluded.seller_id,
    agreed_amount_cents = excluded.agreed_amount_cents,
    fulfillment_method = excluded.fulfillment_method,
    currency = excluded.currency,
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.delivery_helper_is_verified(uuid) from public, anon;
revoke all on function public.delivery_new_code() from public, anon, authenticated;
revoke all on function public.create_delivery_job_for_request(uuid,text,text,timestamptz,text,integer,text,text,numeric) from public, anon;
revoke all on function public.delivery_make_offer(uuid,integer,text) from public, anon;
revoke all on function public.delivery_counter_offer(uuid,integer) from public, anon;
revoke all on function public.delivery_accept_offer(uuid) from public, anon;
revoke all on function public.delivery_set_status(uuid,text) from public, anon;
revoke all on function public.delivery_get_confirmation_code(uuid,text) from public, anon;
revoke all on function public.delivery_verify_confirmation_code(uuid,text,text) from public, anon;
revoke all on function public.delivery_complete(uuid) from public, anon;
revoke all on function public.delivery_set_private_locations(uuid,text,text) from public, anon;
revoke all on function public.delivery_get_private_locations(uuid) from public, anon;
revoke all on function public.purchase_marketplace_listing_flexible(uuid,text,text,text,text,integer,timestamptz) from public, anon;

grant execute on function public.delivery_helper_is_verified(uuid) to authenticated, service_role;
grant execute on function public.create_delivery_job_for_request(uuid,text,text,timestamptz,text,integer,text,text,numeric) to authenticated, service_role;
grant execute on function public.delivery_make_offer(uuid,integer,text) to authenticated, service_role;
grant execute on function public.delivery_counter_offer(uuid,integer) to authenticated, service_role;
grant execute on function public.delivery_accept_offer(uuid) to authenticated, service_role;
grant execute on function public.delivery_set_status(uuid,text) to authenticated, service_role;
grant execute on function public.delivery_get_confirmation_code(uuid,text) to authenticated, service_role;
grant execute on function public.delivery_verify_confirmation_code(uuid,text,text) to authenticated, service_role;
grant execute on function public.delivery_complete(uuid) to authenticated, service_role;
grant execute on function public.delivery_set_private_locations(uuid,text,text) to authenticated, service_role;
grant execute on function public.delivery_get_private_locations(uuid) to authenticated, service_role;
grant execute on function public.purchase_marketplace_listing_flexible(uuid,text,text,text,text,integer,timestamptz) to authenticated, service_role;
