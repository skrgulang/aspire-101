-- Treat a NULL payment method as no payment so it cannot bypass the monetary guard.
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
