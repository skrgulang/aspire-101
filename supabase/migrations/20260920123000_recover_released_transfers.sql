alter table public.connection_payments
  add column if not exists transfer_recovery_status text not null default 'not_required',
  add column if not exists transfer_recovery_reason text,
  add column if not exists transfer_recovery_claimed_at timestamptz,
  add column if not exists stripe_transfer_reversal_id text,
  add column if not exists transfer_reversed_at timestamptz,
  add column if not exists transfer_recovery_error text;

alter table public.connection_payments
  drop constraint if exists connection_payments_transfer_recovery_status_check,
  add constraint connection_payments_transfer_recovery_status_check
  check (transfer_recovery_status in ('not_required','pending','reversed','manual_required'));

alter table public.connection_payments
  drop constraint if exists connection_payments_transfer_recovery_reason_check,
  add constraint connection_payments_transfer_recovery_reason_check
  check (transfer_recovery_reason is null or transfer_recovery_reason in ('refund','dispute'));

create unique index if not exists connection_payments_transfer_reversal_id_key
  on public.connection_payments(stripe_transfer_reversal_id)
  where stripe_transfer_reversal_id is not null;

create or replace function public.claim_connection_payment_transfer_recovery(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payment public.connection_payments;
  v_claimed_at timestamptz;
begin
  if p_reason not in ('refund','dispute') then
    raise exception 'INVALID_TRANSFER_RECOVERY_REASON';
  end if;

  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.stripe_transfer_id is null then
    return jsonb_build_object('status','not_required');
  end if;
  if v_payment.stripe_transfer_reversal_id is not null then
    return jsonb_build_object(
      'status','reversed',
      'reversal_id',v_payment.stripe_transfer_reversal_id
    );
  end if;
  if v_payment.transfer_recovery_claimed_at is not null
     and v_payment.transfer_recovery_claimed_at > now() - interval '5 minutes' then
    return jsonb_build_object('status','busy');
  end if;

  v_claimed_at := now();
  update public.connection_payments
  set transfer_recovery_status = 'pending',
      transfer_recovery_reason = p_reason,
      transfer_recovery_claimed_at = v_claimed_at,
      transfer_recovery_error = null,
      updated_at = v_claimed_at
  where id = v_payment.id;

  return jsonb_build_object('status','claimed','claimed_at',v_claimed_at);
end;
$function$;

create or replace function public.record_connection_payment_transfer_recovery(
  p_payment_id uuid,
  p_reason text,
  p_outcome text,
  p_reversal_id text default null,
  p_amount_cents integer default null,
  p_refund_id text default null,
  p_error text default null,
  p_stripe_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payment public.connection_payments;
  v_order public.market_orders;
  v_now timestamptz := now();
  v_status text;
begin
  if p_reason not in ('refund','dispute') then
    raise exception 'INVALID_TRANSFER_RECOVERY_REASON';
  end if;
  if p_outcome not in ('reversed','manual_required') then
    raise exception 'INVALID_TRANSFER_RECOVERY_OUTCOME';
  end if;
  if p_outcome = 'reversed'
     and nullif(btrim(coalesce(p_reversal_id,'')),'') is null then
    raise exception 'TRANSFER_REVERSAL_ID_REQUIRED';
  end if;

  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.stripe_transfer_id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_payment.stripe_transfer_reversal_id is not null
     and p_reversal_id is not null
     and v_payment.stripe_transfer_reversal_id <> p_reversal_id then
    raise exception 'TRANSFER_REVERSAL_ID_MISMATCH';
  end if;

  v_status := case
    when p_reason = 'refund' then 'refunded'
    when v_payment.status = 'refunded' then 'refunded'
    else 'disputed'
  end;

  update public.connection_payments
  set status = v_status,
      stripe_refund_id = case
        when p_reason = 'refund' then coalesce(stripe_refund_id,p_refund_id)
        else stripe_refund_id
      end,
      refunded_at = case
        when p_reason = 'refund' then coalesce(refunded_at,v_now)
        else refunded_at
      end,
      disputed_at = case
        when p_reason = 'dispute' then coalesce(disputed_at,v_now)
        else disputed_at
      end,
      transfer_recovery_status = p_outcome,
      transfer_recovery_reason = p_reason,
      stripe_transfer_reversal_id = coalesce(stripe_transfer_reversal_id,p_reversal_id),
      transfer_reversed_at = case
        when p_outcome = 'reversed' then coalesce(transfer_reversed_at,v_now)
        else transfer_reversed_at
      end,
      transfer_recovery_claimed_at = null,
      transfer_recovery_error = case
        when p_outcome = 'manual_required' then left(coalesce(p_error,'Transfer recovery requires manual review.'),500)
        else null
      end,
      failure_reason = case
        when p_outcome = 'manual_required' then
          'Buyer funds were returned or disputed after seller payout. Aspire must recover the seller transfer manually.'
        when p_reason = 'refund' then
          'Stripe confirmed a refund after seller payout; the seller transfer was reversed.'
        else
          'Stripe opened a dispute after seller payout; the seller transfer was reversed pending review.'
      end,
      updated_at = v_now
  where id = v_payment.id;

  select * into v_order
  from public.market_orders
  where connection_id = v_payment.connection_id
  for update;

  if found then
    update public.market_orders
    set status = case
          when p_reason = 'refund' then 'refunded'
          when status = 'refunded' then status
          else 'disputed'
        end,
        refunded_at = case when p_reason = 'refund' then coalesce(refunded_at,v_now) else refunded_at end,
        updated_at = v_now
    where id = v_order.id;

    if p_stripe_event_id is null or not exists (
      select 1 from public.market_order_events e
      where e.market_order_id = v_order.id
        and e.payload ->> 'stripe_event_id' = p_stripe_event_id
    ) then
      insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
      values (
        v_order.id,
        null,
        case when p_reason = 'refund' then 'refund_created' else 'dispute_opened' end,
        jsonb_strip_nulls(jsonb_build_object(
          'stripe_event_id',p_stripe_event_id,
          'stripe_refund_id',p_refund_id,
          'stripe_transfer_reversal_id',coalesce(p_reversal_id,v_payment.stripe_transfer_reversal_id),
          'recovered_cents',p_amount_cents,
          'recovery_outcome',p_outcome
        ))
      );
    end if;
  end if;

  if p_stripe_event_id is null or not exists (
    select 1 from public.connection_events e
    where e.connection_id = v_payment.connection_id
      and e.metadata ->> 'stripe_event_id' = p_stripe_event_id
  ) then
    insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
    values (
      v_payment.connection_id,
      null,
      case when p_reason = 'refund' then 'payment_refunded' else 'payment_disputed' end,
      case
        when p_reason = 'refund' and p_outcome = 'reversed'
          then 'Stripe confirmed the customer refund and Aspire reversed the seller payout.'
        when p_reason = 'refund'
          then 'Stripe confirmed the customer refund. Seller payout recovery requires manual review.'
        when p_outcome = 'reversed'
          then 'Stripe opened a payment dispute and Aspire reversed the seller payout pending review.'
        else 'Stripe opened a payment dispute. Seller payout recovery requires manual review.'
      end,
      jsonb_strip_nulls(jsonb_build_object(
        'stripe_event_id',p_stripe_event_id,
        'stripe_refund_id',p_refund_id,
        'stripe_transfer_reversal_id',coalesce(p_reversal_id,v_payment.stripe_transfer_reversal_id),
        'recovered_cents',p_amount_cents,
        'recovery_outcome',p_outcome
      ))
    );
  end if;

  return jsonb_build_object(
    'status',v_status,
    'recovery_status',p_outcome,
    'reversal_id',coalesce(p_reversal_id,v_payment.stripe_transfer_reversal_id)
  );
end;
$function$;

revoke all on function public.claim_connection_payment_transfer_recovery(uuid,text) from public, anon, authenticated;
revoke all on function public.record_connection_payment_transfer_recovery(uuid,text,text,text,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_connection_payment_transfer_recovery(uuid,text) to service_role;
grant execute on function public.record_connection_payment_transfer_recovery(uuid,text,text,text,integer,text,text,text) to service_role;