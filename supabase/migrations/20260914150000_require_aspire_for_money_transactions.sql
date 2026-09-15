-- Monetary requests and marketplace orders must use Aspire Protected.
-- Free community/collaboration posts stay outside Stripe and payout workflows.

create or replace function public.guard_request_payment_terms()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.kind in ('paid_help', 'split_cost', 'buy_sell') then
    if coalesce(new.amount_cents, 0) <= 0 then
      raise exception 'MONEY_AMOUNT_REQUIRED';
    end if;
    new.payment_method := 'aspire';
  else
    new.payment_method := 'none';
    new.amount_cents := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_request_payment_terms_tg on public.requests;
create trigger guard_request_payment_terms_tg
before insert or update of kind, amount_cents, payment_method on public.requests
for each row execute function public.guard_request_payment_terms();

-- Bring still-actionable monetary posts onto the protected path. Closed history
-- is intentionally left untouched so historical fee/payment records remain true.
update public.requests
set payment_method = 'aspire', updated_at = now()
where kind in ('paid_help', 'split_cost', 'buy_sell')
  and coalesce(amount_cents, 0) > 0
  and status in ('open', 'matched', 'in_progress')
  and payment_method <> 'aspire';

create or replace function public.guard_connection_payment_terms()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  request_kind text;
begin
  select kind into request_kind from public.requests where id = new.request_id;
  if request_kind in ('paid_help', 'split_cost', 'buy_sell') and coalesce(new.payment_method, 'none') <> 'aspire' then
    raise exception 'MONEY_REQUIRES_ASPIRE';
  end if;
  if request_kind in ('community', 'collaboration') and coalesce(new.payment_method, 'none') <> 'none' then
    raise exception 'FREE_REQUEST_HAS_NO_PAYMENT';
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_connection_payment_terms_tg on public.connections;
create trigger guard_connection_payment_terms_tg
before insert or update of payment_method on public.connections
for each row execute function public.guard_connection_payment_terms();

create or replace function public.guard_agreement_payment_terms()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  request_kind text;
begin
  select r.kind into request_kind
  from public.connections c
  join public.requests r on r.id = c.request_id
  where c.id = new.connection_id;
  if request_kind in ('paid_help', 'split_cost', 'buy_sell') and coalesce(new.payment_method, 'none') <> 'aspire' then
    raise exception 'MONEY_REQUIRES_ASPIRE';
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_agreement_payment_terms_tg on public.connection_payment_agreements;
create trigger guard_agreement_payment_terms_tg
before insert or update of payment_method on public.connection_payment_agreements
for each row execute function public.guard_agreement_payment_terms();

create or replace function public.purchase_marketplace_listing(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_request public.requests;
  v_buyer uuid := auth.uid();
  v_connection_id uuid;
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

  insert into public.connections (
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, agreed_terms, payment_method
  ) values (
    v_request.id, v_request.poster_id, v_buyer, true, true,
    'confirmed', v_request.amount_cents,
    jsonb_build_object(
      'category', v_request.category,
      'kind', v_request.kind,
      'source', 'marketplace_buy_now',
      'protection', 'aspire_protected'
    ),
    'aspire'
  ) returning id into v_connection_id;

  update public.requests set status = 'matched', updated_at = now() where id = v_request.id;
  return v_connection_id;
end;
$fn$;

revoke all on function public.purchase_marketplace_listing(uuid) from public;
grant execute on function public.purchase_marketplace_listing(uuid) to authenticated;
