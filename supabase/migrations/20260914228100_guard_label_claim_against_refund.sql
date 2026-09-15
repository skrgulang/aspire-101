-- Defense in depth for legacy/direct market_orders label claims.
-- The preferred path is claim_market_shipping_label_purchase(), but until every caller is
-- migrated, entering label_purchasing must also lock/check the protected payment.

create or replace function public.guard_shipping_label_claim_against_payment_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
begin
  if new.shipping_status is distinct from 'label_purchasing'
     or old.shipping_status is not distinct from 'label_purchasing' then
    return new;
  end if;

  select * into v_payment
  from public.connection_payments
  where connection_id = new.connection_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status <> 'secured' or v_payment.stripe_transfer_id is not null then
    raise exception 'PAYMENT_NOT_SECURED';
  end if;
  if v_payment.refund_claimed_at is not null then
    raise exception 'REFUND_IN_PROGRESS';
  end if;
  if v_payment.release_claimed_at is not null then
    raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_shipping_label_claim_against_payment_hold() from public, anon, authenticated;

drop trigger if exists trg_guard_shipping_label_claim_against_payment_hold on public.market_orders;
create trigger trg_guard_shipping_label_claim_against_payment_hold
before update of shipping_status on public.market_orders
for each row
when (new.shipping_status = 'label_purchasing' and old.shipping_status is distinct from 'label_purchasing')
execute function public.guard_shipping_label_claim_against_payment_hold();
