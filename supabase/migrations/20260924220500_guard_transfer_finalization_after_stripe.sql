-- A Stripe transfer can succeed after a dispute/cancellation starts. Recheck the
-- payment, connection and marketplace order under row locks before finalizing.
alter table public.connection_payments
  add column if not exists stripe_transfer_attempted_at timestamptz;

create index if not exists connection_payments_transfer_attempt_reconcile_idx
  on public.connection_payments(stripe_livemode, stripe_transfer_attempted_at)
  where stripe_transfer_attempted_at is not null and status in ('secured','disputed','refunded');

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
  v_connection public.connections;
  v_order public.market_orders;
  v_now timestamptz := now();
  v_duplicate boolean := false;
begin
  if nullif(btrim(coalesce(p_transfer_id,'')),'') is null then raise exception 'TRANSFER_ID_REQUIRED'; end if;
  select * into v_payment from public.connection_payments where id=p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.stripe_transfer_id is not null and v_payment.stripe_transfer_id <> p_transfer_id then
    raise exception 'TRANSFER_ID_MISMATCH';
  end if;

  if v_payment.status = 'released' then
    if v_payment.stripe_transfer_id is null then
      update public.connection_payments
      set stripe_transfer_id=p_transfer_id, release_claimed_at=null, updated_at=v_now
      where id=v_payment.id;
    end if;
    v_duplicate := true;
  elsif v_payment.status = 'secured' then
    select * into v_connection from public.connections where id=v_payment.connection_id for update;
    if not found or v_connection.status='cancelled' then raise exception 'CONNECTION_CANCELLED'; end if;
    select * into v_order from public.market_orders where connection_id=v_payment.connection_id for update;
    if found and (v_order.status <> 'release_ready'
       or (not (v_order.seller_handed_off_at is not null and v_order.buyer_received_at is not null)
           and (v_order.admin_release_authorized_at is null or v_order.admin_release_authorized_by is null))) then
      raise exception 'MARKET_RELEASE_NOT_READY';
    end if;
    if v_payment.refund_claimed_at is not null or exists (
      select 1 from public.payment_refund_requests where payment_id=v_payment.id
        and status in ('open','under_review','approved')
    ) or exists (
      select 1 from public.connection_resolution_cases where connection_id=v_payment.connection_id
        and status in ('submitted','under_review')
    ) or exists (
      select 1 from public.market_disputes where market_order_id=v_order.id
        and status in ('open','under_review')
    ) then raise exception 'PAYOUT_HOLD_OPEN'; end if;
    update public.connection_payments
    set status='released',stripe_transfer_id=p_transfer_id,released_at=v_now,
        release_claimed_at=null,failure_reason=null,updated_at=v_now
    where id=v_payment.id;
  else
    raise exception 'PAYMENT_NOT_SECURED';
  end if;

  if not v_duplicate then
    update public.connections
    set status=case when status in ('pending','confirmed','active') then 'completed' else status end,
        updated_at=v_now where id=v_payment.connection_id;
    update public.requests
    set status=case when status in ('open','matched','in_progress') then 'completed' else status end,
        updated_at=v_now where id=v_payment.request_id;
    update public.market_orders
    set status='released',released_at=coalesce(released_at,v_now),updated_at=v_now
    where connection_id=v_payment.connection_id and status <> 'refunded';
  end if;

  return jsonb_build_object(
    'status','released','transfer_id',p_transfer_id,'connection_id',v_payment.connection_id,'duplicate',v_duplicate
  );
end;
$$;

revoke all on function public.finalize_connection_payment_release(uuid,text) from public, anon, authenticated;
grant execute on function public.finalize_connection_payment_release(uuid,text) to service_role;
