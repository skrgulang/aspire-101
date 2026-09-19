-- Require a very recent live Stripe payout refresh before an authenticated
-- browser can change review-sensitive fields on an existing seller listing.
-- The public status route performs the Stripe check and syncs payment_accounts;
-- this trigger prevents callers from bypassing that check by invoking the
-- resubmission RPC directly.

create or replace function public.has_recent_verified_seller_payout(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select pa.status, pa.transfers_enabled, pa.last_synced_at
    from public.payment_accounts pa
    where pa.user_id = p_user_id
    order by pa.last_synced_at desc nulls last
    limit 1
  )
  select exists (
    select 1
    from latest
    where status = 'READY'
      and transfers_enabled is true
      and last_synced_at is not null
      and last_synced_at >= now() - interval '2 minutes'
  );
$$;

revoke all on function public.has_recent_verified_seller_payout(uuid) from public, anon, authenticated;

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

  if v_sensitive_changed
     and not public.has_recent_verified_seller_payout(new.poster_id)
  then
    raise exception 'PAYOUT_VERIFICATION_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_seller_review_sensitive_update() from public, anon, authenticated;

drop trigger if exists guard_seller_review_sensitive_update_tg on public.requests;
create trigger guard_seller_review_sensitive_update_tg
before update of
  title, details, language_code, amount_cents, item_condition,
  price_negotiable, fulfillment_method, fulfillment_methods,
  seller_area, shipping_paid_by_default, shipping_paid_by_preference,
  seller_delivery_mode, seller_delivery_price_cents
on public.requests
for each row execute function public.guard_seller_review_sensitive_update();
