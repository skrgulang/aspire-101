-- Bind seller listings to the Stripe environment they were verified against.
-- This prevents a fresh test-mode payout record from satisfying a future live-mode
-- seller resubmission (or vice versa).

alter table public.requests
  add column if not exists seller_livemode boolean;

update public.requests r
set seller_livemode = (
  select pa.livemode
  from public.payment_accounts pa
  where pa.user_id = r.poster_id
  order by pa.last_synced_at desc nulls last, pa.created_at desc
  limit 1
)
where r.kind = 'buy_sell'
  and coalesce(r.market_intent, 'sell') = 'sell'
  and r.seller_livemode is null
  and exists (
    select 1
    from public.payment_accounts pa
    where pa.user_id = r.poster_id
  );

do $$
begin
  if exists (
    select 1
    from public.requests r
    where r.kind = 'buy_sell'
      and coalesce(r.market_intent, 'sell') = 'sell'
      and r.seller_livemode is null
  ) then
    raise exception 'SELLER_LIVEMODE_BACKFILL_INCOMPLETE';
  end if;
end $$;

alter table public.requests
  drop constraint if exists requests_seller_livemode_check;

alter table public.requests
  add constraint requests_seller_livemode_check
  check (
    not (kind = 'buy_sell' and coalesce(market_intent, 'sell') = 'sell')
    or seller_livemode is not null
  );

create or replace function public.has_recent_verified_seller_payout(
  p_user_id uuid,
  p_livemode boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payment_accounts pa
    where pa.user_id = p_user_id
      and pa.livemode = p_livemode
      and pa.status = 'READY'
      and pa.transfers_enabled is true
      and pa.last_synced_at is not null
      and pa.last_synced_at >= now() - interval '2 minutes'
  );
$$;

revoke all on function public.has_recent_verified_seller_payout(uuid,boolean)
  from public, anon, authenticated;

create or replace function public.guard_seller_review_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sensitive_changed boolean;
begin
  if new.kind <> 'buy_sell'
     or coalesce(new.market_intent, 'sell') <> 'sell'
     or coalesce(auth.role(), '') <> 'authenticated'
  then
    return new;
  end if;

  v_sensitive_changed :=
       new.title is distinct from old.title
    or new.details is distinct from old.details
    or new.language_code is distinct from old.language_code
    or new.amount_cents is distinct from old.amount_cents
    or new.item_condition is distinct from old.item_condition
    or new.price_negotiable is distinct from old.price_negotiable
    or new.fulfillment_method is distinct from old.fulfillment_method
    or new.fulfillment_methods is distinct from old.fulfillment_methods
    or new.seller_area is distinct from old.seller_area
    or new.shipping_paid_by_default is distinct from old.shipping_paid_by_default
    or new.shipping_paid_by_preference is distinct from old.shipping_paid_by_preference
    or new.seller_delivery_mode is distinct from old.seller_delivery_mode
    or new.seller_delivery_price_cents is distinct from old.seller_delivery_price_cents;

  if v_sensitive_changed then
    if new.seller_livemode is null
       or not public.has_recent_verified_seller_payout(new.poster_id, new.seller_livemode)
    then
      raise exception 'PAYOUT_VERIFICATION_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_seller_review_sensitive_update()
  from public, anon, authenticated;

drop trigger if exists guard_seller_review_sensitive_update_tg on public.requests;
create trigger guard_seller_review_sensitive_update_tg
before update of
  title, details, language_code, amount_cents, item_condition,
  price_negotiable, fulfillment_method, fulfillment_methods,
  seller_area, shipping_paid_by_default, shipping_paid_by_preference,
  seller_delivery_mode, seller_delivery_price_cents
on public.requests
for each row execute function public.guard_seller_review_sensitive_update();

drop function if exists public.has_recent_verified_seller_payout(uuid);
