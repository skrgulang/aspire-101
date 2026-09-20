-- Keep a marketplace order in awaiting_payment when Stripe Checkout has only
-- been created. payment_processing begins only after Stripe reports that the
-- buyer actually submitted the Checkout Session.
create or replace function public.sync_market_order_payment_state()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  next_status text;
begin
  if not exists (select 1 from public.market_orders where connection_id = new.connection_id) then
    return new;
  end if;

  next_status := case
    when new.status = 'checkout_created' then 'awaiting_payment'
    when new.status = 'processing' then 'payment_processing'
    when new.status = 'secured' then 'paid'
    when new.status = 'released' then 'released'
    when new.status = 'disputed' then 'disputed'
    when new.status = 'refunded' then 'refunded'
    when new.status = 'cancelled' then 'cancelled'
    else null
  end;

  update public.market_orders
  set payment_id = new.id,
      status = case
        when next_status is null then status
        when next_status = 'awaiting_payment'
          and status in ('awaiting_payment','payment_processing') then 'awaiting_payment'
        when next_status = 'payment_processing'
          and status in ('awaiting_payment','payment_processing') then 'payment_processing'
        when next_status = 'paid'
          and status in ('handoff_confirmed','release_ready','disputed') then status
        else next_status
      end,
      released_at = case when new.status = 'released' then coalesce(new.released_at, now()) else released_at end,
      refunded_at = case when new.status = 'refunded' then coalesce(new.refunded_at, now()) else refunded_at end,
      dispute_opened_at = case when new.status = 'disputed' then coalesce(new.disputed_at, now()) else dispute_opened_at end,
      updated_at = now()
  where connection_id = new.connection_id;

  return new;
end;
$function$;

revoke all on function public.sync_market_order_payment_state() from public, anon, authenticated;
grant execute on function public.sync_market_order_payment_state() to service_role;

-- Reconcile orders that were incorrectly moved forward merely because a
-- Checkout Session was opened but no PaymentIntent or charge exists.
update public.market_orders mo
set status = 'awaiting_payment',
    updated_at = now()
from public.connection_payments cp
where cp.connection_id = mo.connection_id
  and mo.status = 'payment_processing'
  and cp.status = 'checkout_created'
  and cp.stripe_payment_intent_id is null
  and cp.stripe_charge_id is null;
