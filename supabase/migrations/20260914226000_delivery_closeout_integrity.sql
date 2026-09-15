-- Final closeout integrity for Aspirer Delivery.
-- A delivery may only move from delivered -> completed after both proof-backed
-- connection confirmations exist. Paid rewards must still be secured/released;
-- completion never releases money by itself.

create or replace function public.delivery_complete(p_delivery_job_id uuid)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  c public.connections;
  v_count integer := 0;
  v_helper_confirmed boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into j
  from public.delivery_jobs
  where id = p_delivery_job_id
  for update;

  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.requester_id and auth.uid() <> j.dropoff_party_id then
    raise exception 'NOT_DROPOFF_PARTY';
  end if;
  if j.status = 'completed' then return j; end if;
  if j.status <> 'delivered' then raise exception 'DELIVERY_NOT_DELIVERED'; end if;
  if j.connection_id is null then raise exception 'DELIVERY_CONNECTION_NOT_READY'; end if;

  select * into c
  from public.connections
  where id = j.connection_id
  for update;

  if not found then raise exception 'DELIVERY_CONNECTION_NOT_READY'; end if;
  if c.status = 'cancelled' then raise exception 'DELIVERY_CONNECTION_CANCELLED'; end if;
  if auth.uid() <> c.requester_id then raise exception 'NOT_REQUESTER'; end if;

  -- The matched Aspirer's successful delivery-code verification is written as the
  -- responder confirmation by delivery_verify_confirmation_code(). Require that
  -- proof to exist before the receiver can close the delivery lifecycle.
  select exists(
    select 1
    from public.connection_completion_confirmations cc
    where cc.connection_id = c.id
      and cc.user_id = c.responder_id
  ) into v_helper_confirmed;

  if not v_helper_confirmed then
    raise exception 'ASPIRER_DELIVERY_CONFIRMATION_REQUIRED';
  end if;

  -- Defense in depth: paid delivery cannot be completed if the protected reward
  -- is no longer secured/released. Free delivery continues without Stripe.
  if coalesce(j.agreed_reward_cents, 0) > 0
     and not coalesce(public.delivery_payment_is_secured(j.id), false)
  then
    raise exception 'DELIVERY_PAYMENT_NOT_SECURED';
  end if;

  insert into public.connection_completion_confirmations(connection_id,user_id)
  values (c.id, auth.uid())
  on conflict (connection_id,user_id) do nothing;

  select count(*)::integer into v_count
  from public.connection_completion_confirmations cc
  where cc.connection_id = c.id
    and cc.user_id in (c.requester_id,c.responder_id);

  if v_count < 2 then
    raise exception 'COMPLETION_NOT_READY';
  end if;

  update public.delivery_jobs
  set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = j.id
  returning * into j;

  update public.connections
  set status = 'completed', updated_at = now()
  where id = c.id
    and status <> 'cancelled';

  update public.requests
  set status = 'completed', updated_at = now()
  where id = c.request_id
    and status not in ('completed','cancelled');

  return j;
end;
$$;

revoke all on function public.delivery_complete(uuid) from public, anon;
grant execute on function public.delivery_complete(uuid) to authenticated, service_role;
