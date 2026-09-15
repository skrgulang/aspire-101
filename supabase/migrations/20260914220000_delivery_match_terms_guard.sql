-- Lock matched Aspirer Delivery terms to the accepted offer / connection.
-- A matched job must keep one requester, one Aspirer, one connection and one agreed reward.
-- Paid rewards must remain Aspire Protected; free rewards must remain payment-free.

create or replace function public.guard_delivery_match_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.connections;
  r public.requests;
  v_matched boolean;
  v_amount integer;
begin
  v_matched := new.status in ('matched','heading_to_pickup','picked_up','on_the_way','delivered','completed');

  -- Once a job has been matched, its economic/participant terms are immutable.
  if tg_op = 'UPDATE' and old.connection_id is not null then
    if old.connection_id is distinct from new.connection_id
       or old.request_id is distinct from new.request_id
       or old.requester_id is distinct from new.requester_id
       or old.matched_aspirer_id is distinct from new.matched_aspirer_id
       or old.agreed_reward_cents is distinct from new.agreed_reward_cents
       or old.reward_mode is distinct from new.reward_mode
    then
      raise exception 'DELIVERY_MATCH_TERMS_LOCKED';
    end if;
  end if;

  if not v_matched then
    return new;
  end if;

  if new.connection_id is null
     or new.matched_aspirer_id is null
     or new.agreed_reward_cents is null
  then
    raise exception 'DELIVERY_MATCH_TERMS_INCOMPLETE';
  end if;

  select * into c
  from public.connections
  where id = new.connection_id;
  if not found then raise exception 'DELIVERY_CONNECTION_NOT_FOUND'; end if;

  if c.request_id <> new.request_id
     or c.requester_id <> new.requester_id
     or c.responder_id <> new.matched_aspirer_id
  then
    raise exception 'DELIVERY_CONNECTION_PARTICIPANT_MISMATCH';
  end if;

  select * into r
  from public.requests
  where id = new.request_id;
  if not found then raise exception 'DELIVERY_REQUEST_NOT_FOUND'; end if;

  v_amount := new.agreed_reward_cents;

  if v_amount > 0 then
    if c.payment_method is distinct from 'aspire'
       or c.agreed_amount_cents is distinct from v_amount
       or r.kind is distinct from 'paid_help'
       or r.payment_method is distinct from 'aspire'
       or r.amount_cents is distinct from v_amount
    then
      raise exception 'PAID_DELIVERY_TERMS_MISMATCH';
    end if;
  else
    if c.payment_method is distinct from 'none'
       or coalesce(c.agreed_amount_cents, 0) <> 0
       or r.kind is distinct from 'community'
       or r.payment_method is distinct from 'none'
       or r.amount_cents is not null
    then
      raise exception 'FREE_DELIVERY_TERMS_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_delivery_match_terms() from public;

drop trigger if exists trg_guard_delivery_match_terms on public.delivery_jobs;
create trigger trg_guard_delivery_match_terms
before insert or update of
  status,
  connection_id,
  request_id,
  requester_id,
  matched_aspirer_id,
  agreed_reward_cents,
  reward_mode
on public.delivery_jobs
for each row execute function public.guard_delivery_match_terms();
