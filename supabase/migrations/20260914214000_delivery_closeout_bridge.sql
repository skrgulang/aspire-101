-- Bridge the delivery proof flow into the existing connection closeout lifecycle.
-- The matched Aspirer confirms their side when the one-time delivery code succeeds.
-- The requester/drop-off party confirms their side when they mark the delivery complete.
-- Free deliveries can close immediately after both confirmations; paid deliveries remain
-- active until the protected reward release endpoint completes the payout.

create or replace function public.delivery_verify_confirmation_code(
  p_delivery_job_id uuid,
  p_kind text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  s public.delivery_confirmation_secrets;
  v_code text := btrim(coalesce(p_code, ''));
  v_attempts integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind not in ('pickup','delivery') then raise exception 'INVALID_CONFIRMATION_KIND'; end if;
  if v_code !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'error','INVALID_CODE_FORMAT'); end if;

  select * into j from public.delivery_jobs where id = p_delivery_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.matched_aspirer_id then raise exception 'NOT_MATCHED_ASPIRER'; end if;
  select * into s from public.delivery_confirmation_secrets where delivery_job_id = j.id for update;

  if p_kind = 'pickup' then
    if s.pickup_used_at is not null then return jsonb_build_object('ok',true,'status',j.status); end if;
    if j.status not in ('matched','heading_to_pickup') then raise exception 'INVALID_DELIVERY_TRANSITION'; end if;
    if s.pickup_attempts >= 8 then return jsonb_build_object('ok',false,'error','CODE_LOCKED'); end if;
    if s.pickup_code <> v_code then
      update public.delivery_confirmation_secrets set pickup_attempts = pickup_attempts + 1 where delivery_job_id = j.id;
      v_attempts := s.pickup_attempts + 1;
      return jsonb_build_object('ok',false,'error','INVALID_CODE','attempts_remaining',greatest(0,8-v_attempts));
    end if;
    update public.delivery_confirmation_secrets set pickup_used_at = now() where delivery_job_id = j.id;
    update public.delivery_jobs set status = 'picked_up', picked_up_at = now(), updated_at = now() where id = j.id returning * into j;
    return jsonb_build_object('ok',true,'status',j.status);
  end if;

  if s.delivery_used_at is not null then return jsonb_build_object('ok',true,'status',j.status); end if;
  if j.status not in ('picked_up','on_the_way') then raise exception 'INVALID_DELIVERY_TRANSITION'; end if;
  if s.delivery_attempts >= 8 then return jsonb_build_object('ok',false,'error','CODE_LOCKED'); end if;
  if s.delivery_code <> v_code then
    update public.delivery_confirmation_secrets set delivery_attempts = delivery_attempts + 1 where delivery_job_id = j.id;
    v_attempts := s.delivery_attempts + 1;
    return jsonb_build_object('ok',false,'error','INVALID_CODE','attempts_remaining',greatest(0,8-v_attempts));
  end if;

  update public.delivery_confirmation_secrets set delivery_used_at = now() where delivery_job_id = j.id;
  update public.delivery_jobs set status = 'delivered', delivered_at = now(), updated_at = now() where id = j.id returning * into j;

  -- Entering the receiver's one-time delivery code is the Aspirer's explicit completion
  -- confirmation. Record it in the shared connection lifecycle so they do not have to
  -- repeat the same confirmation on a separate screen.
  if j.connection_id is not null then
    insert into public.connection_completion_confirmations(connection_id,user_id)
    values (j.connection_id, auth.uid())
    on conflict (connection_id,user_id) do nothing;
  end if;

  return jsonb_build_object('ok',true,'status',j.status,'aspirer_closeout_confirmed',true);
end;
$$;

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

      -- Free delivery has no protected money to release, so both proof-backed
      -- confirmations can close the connection immediately. Paid delivery stays active
      -- until the existing payout release endpoint moves it to completed.
      if v_count >= 2 and coalesce(c.payment_method,'none') <> 'aspire' then
        update public.connections set status = 'completed', updated_at = now() where id = c.id;
        update public.requests set status = 'completed', updated_at = now()
          where id = c.request_id and status not in ('completed','cancelled');
      end if;
    end if;
  end if;

  return j;
end;
$$;

revoke all on function public.delivery_verify_confirmation_code(uuid,text,text) from public, anon;
revoke all on function public.delivery_complete(uuid) from public, anon;
grant execute on function public.delivery_verify_confirmation_code(uuid,text,text) to authenticated, service_role;
grant execute on function public.delivery_complete(uuid) to authenticated, service_role;
