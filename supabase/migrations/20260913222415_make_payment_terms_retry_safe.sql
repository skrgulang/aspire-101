create or replace function public.propose_connection_payment_terms(p_connection_id uuid, p_amount_cents integer, p_payment_method text)
returns connection_payment_agreements
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  if p.id is not null and p.status in ('checkout_created','processing','secured','released','refunded','disputed') then
    raise exception 'PAYMENT_ALREADY_LOCKED';
  end if;

  select * into a
  from public.connection_payment_agreements
  where connection_id = c.id
  for update;

  if found
     and a.amount_cents = p_amount_cents
     and a.payment_method = p_payment_method
     and a.status in ('proposed','agreed') then
    return a;
  end if;

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
$fn$;

create or replace function public.accept_connection_payment_terms(p_connection_id uuid)
returns connection_payment_agreements
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  if not found then raise exception 'NO_TERMS_TO_ACCEPT'; end if;
  if a.status = 'agreed' then return a; end if;
  if a.status <> 'proposed' then raise exception 'NO_TERMS_TO_ACCEPT'; end if;

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
$fn$;
