-- Delivery completion is a lifecycle fact, separate from payout success.
-- Once both proof-backed participants have confirmed completion, close the
-- delivery connection and request even when a paid reward is still waiting
-- for protected payout release. The Stripe release endpoint remains the only
-- path that moves secured money to the Aspirer.

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
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into j from public.delivery_jobs where id = p_delivery_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.requester_id and auth.uid() <> j.dropoff_party_id then raise exception 'NOT_DROPOFF_PARTY'; end if;
  if j.status <> 'delivered' then raise exception 'DELIVERY_NOT_DELIVERED'; end if;

  update public.delivery_jobs
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = j.id
  returning * into j;

  if j.connection_id is not null then
    select * into c from public.connections where id = j.connection_id for update;
    if found and (auth.uid() = c.requester_id or auth.uid() = c.responder_id) then
      insert into public.connection_completion_confirmations(connection_id,user_id)
      values (j.connection_id, auth.uid())
      on conflict (connection_id,user_id) do nothing;

      select count(*)::integer into v_count
      from public.connection_completion_confirmations
      where connection_id = j.connection_id
        and user_id in (c.requester_id,c.responder_id);

      if v_count >= 2 then
        update public.connections
        set status = 'completed', updated_at = now()
        where id = c.id and status <> 'cancelled';

        update public.requests
        set status = 'completed', updated_at = now()
        where id = c.request_id and status not in ('completed','cancelled');
      end if;
    end if;
  end if;

  return j;
end;
$$;

revoke all on function public.delivery_complete(uuid) from public, anon;
grant execute on function public.delivery_complete(uuid) to authenticated, service_role;
