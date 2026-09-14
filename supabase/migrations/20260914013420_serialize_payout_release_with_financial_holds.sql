alter table public.connection_payments
  add column if not exists release_claimed_at timestamptz;

create or replace function public.guard_financial_hold_against_payout_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
begin
  if tg_table_name = 'connection_resolution_cases' then
    select * into v_payment
    from public.connection_payments
    where connection_id = new.connection_id
    for update;
  elsif tg_table_name = 'market_disputes' then
    select cp.* into v_payment
    from public.market_orders mo
    join public.connection_payments cp on cp.connection_id = mo.connection_id
    where mo.id = new.market_order_id
    for update of cp;
  elsif tg_table_name = 'payment_refund_requests' then
    select * into v_payment
    from public.connection_payments
    where id = new.payment_id
    for update;
  end if;

  if found
     and v_payment.status = 'secured'
     and v_payment.release_claimed_at is not null then
    if v_payment.release_claimed_at > now() - interval '5 minutes' then
      raise exception 'PAYOUT_RELEASE_IN_PROGRESS';
    end if;

    update public.connection_payments
    set release_claimed_at = null,
        updated_at = now()
    where id = v_payment.id
      and status = 'secured'
      and release_claimed_at = v_payment.release_claimed_at;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_financial_hold_against_payout_release() from public, anon, authenticated;

drop trigger if exists guard_resolution_case_during_payout_release on public.connection_resolution_cases;
create trigger guard_resolution_case_during_payout_release
before insert on public.connection_resolution_cases
for each row execute function public.guard_financial_hold_against_payout_release();

drop trigger if exists guard_market_dispute_during_payout_release on public.market_disputes;
create trigger guard_market_dispute_during_payout_release
before insert on public.market_disputes
for each row execute function public.guard_financial_hold_against_payout_release();

drop trigger if exists guard_refund_request_during_payout_release on public.payment_refund_requests;
create trigger guard_refund_request_during_payout_release
before insert on public.payment_refund_requests
for each row execute function public.guard_financial_hold_against_payout_release();

create or replace function public.claim_connection_payment_release(p_payment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.connection_payments;
  v_claimed_at timestamptz;
begin
  select * into v_payment
  from public.connection_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'released' then
    return coalesce(v_payment.release_claimed_at, v_payment.released_at, now());
  end if;

  if v_payment.status <> 'secured' then
    raise exception 'PAYMENT_NOT_SECURED';
  end if;

  if exists (
    select 1 from public.connections c
    where c.id = v_payment.connection_id and c.status = 'cancelled'
  ) then
    raise exception 'CONNECTION_CANCELLED';
  end if;

  if exists (
    select 1 from public.connection_resolution_cases crc
    where crc.connection_id = v_payment.connection_id
      and crc.status in ('submitted','under_review')
  ) then
    raise exception 'PAYOUT_HOLD_OPEN';
  end if;

  if exists (
    select 1 from public.payment_refund_requests prr
    where prr.payment_id = v_payment.id
      and prr.status in ('open','under_review','approved')
  ) then
    raise exception 'PAYOUT_HOLD_OPEN';
  end if;

  if exists (
    select 1
    from public.market_orders mo
    where mo.connection_id = v_payment.connection_id
      and (
        mo.status = 'disputed'
        or exists (
          select 1 from public.market_disputes md
          where md.market_order_id = mo.id
            and md.status in ('open','under_review')
        )
      )
  ) then
    raise exception 'PAYOUT_HOLD_OPEN';
  end if;

  if v_payment.release_claimed_at is not null
     and v_payment.release_claimed_at > now() - interval '5 minutes' then
    return v_payment.release_claimed_at;
  end if;

  v_claimed_at := now();
  update public.connection_payments
  set release_claimed_at = v_claimed_at,
      updated_at = v_claimed_at
  where id = v_payment.id;

  return v_claimed_at;
end;
$$;

create or replace function public.clear_connection_payment_release_claim(
  p_payment_id uuid,
  p_claimed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.connection_payments
  set release_claimed_at = null,
      updated_at = now()
  where id = p_payment_id
    and status = 'secured'
    and release_claimed_at = p_claimed_at;

  return found;
end;
$$;

revoke all on function public.claim_connection_payment_release(uuid) from public, anon, authenticated;
revoke all on function public.clear_connection_payment_release_claim(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_connection_payment_release(uuid) to service_role;
grant execute on function public.clear_connection_payment_release_claim(uuid,timestamptz) to service_role;
