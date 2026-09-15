-- One-time delivery confirmation codes must fail closed after first successful use.
-- Replays should not report success even though downstream inserts are idempotent.

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
  if v_code !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok',false,'error','INVALID_CODE_FORMAT');
  end if;

  select * into j
  from public.delivery_jobs
  where id = p_delivery_job_id
  for update;

  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.matched_aspirer_id then raise exception 'NOT_MATCHED_ASPIRER'; end if;

  select * into s
  from public.delivery_confirmation_secrets
  where delivery_job_id = j.id
  for update;

  if not found then raise exception 'DELIVERY_CONFIRMATION_NOT_READY'; end if;

  if p_kind = 'pickup' then
    if s.pickup_used_at is not null then
      return jsonb_build_object('ok',false,'error','CODE_ALREADY_USED','status',j.status);
    end if;
    if j.status not in ('matched','heading_to_pickup') then
      raise exception 'INVALID_DELIVERY_TRANSITION';
    end if;
    if not coalesce(public.delivery_payment_is_secured(j.id), false) then
      raise exception 'DELIVERY_PAYMENT_NOT_SECURED';
    end if;
    if s.pickup_attempts >= 8 then
      return jsonb_build_object('ok',false,'error','CODE_LOCKED');
    end if;
    if s.pickup_code <> v_code then
      update public.delivery_confirmation_secrets
      set pickup_attempts = pickup_attempts + 1
      where delivery_job_id = j.id;
      v_attempts := s.pickup_attempts + 1;
      return jsonb_build_object(
        'ok',false,
        'error','INVALID_CODE',
        'attempts_remaining',greatest(0,8-v_attempts)
      );
    end if;

    update public.delivery_confirmation_secrets
    set pickup_used_at = now()
    where delivery_job_id = j.id;

    update public.delivery_jobs
    set status = 'picked_up', picked_up_at = now(), updated_at = now()
    where id = j.id
    returning * into j;

    return jsonb_build_object('ok',true,'status',j.status);
  end if;

  if s.delivery_used_at is not null then
    return jsonb_build_object('ok',false,'error','CODE_ALREADY_USED','status',j.status);
  end if;
  if j.status not in ('picked_up','on_the_way') then
    raise exception 'INVALID_DELIVERY_TRANSITION';
  end if;
  if s.delivery_attempts >= 8 then
    return jsonb_build_object('ok',false,'error','CODE_LOCKED');
  end if;
  if s.delivery_code <> v_code then
    update public.delivery_confirmation_secrets
    set delivery_attempts = delivery_attempts + 1
    where delivery_job_id = j.id;
    v_attempts := s.delivery_attempts + 1;
    return jsonb_build_object(
      'ok',false,
      'error','INVALID_CODE',
      'attempts_remaining',greatest(0,8-v_attempts)
    );
  end if;

  update public.delivery_confirmation_secrets
  set delivery_used_at = now()
  where delivery_job_id = j.id;

  update public.delivery_jobs
  set status = 'delivered', delivered_at = now(), updated_at = now()
  where id = j.id
  returning * into j;

  if j.connection_id is not null then
    insert into public.connection_completion_confirmations(connection_id,user_id)
    values (j.connection_id, auth.uid())
    on conflict (connection_id,user_id) do nothing;
  end if;

  return jsonb_build_object(
    'ok',true,
    'status',j.status,
    'aspirer_closeout_confirmed',true
  );
end;
$$;

revoke all on function public.delivery_verify_confirmation_code(uuid,text,text) from anon;
grant execute on function public.delivery_verify_confirmation_code(uuid,text,text) to authenticated, service_role;
