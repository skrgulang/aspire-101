-- Once Aspire checkout has started, the agreed amount/method must not be
-- reproposed underneath the in-flight payment. Failed/cancelled attempts remain
-- editable so participants can recover and agree new terms.

create or replace function public.propose_connection_payment_terms(p_connection_id uuid, p_amount_cents integer, p_payment_method text)
returns public.connection_payment_agreements
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
