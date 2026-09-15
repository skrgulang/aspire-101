-- Paid Aspirer delivery is a separate protected money flow.
-- The helper cannot start/pick up until the requester has secured that reward.

create or replace function public.delivery_payment_is_secured(p_delivery_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(j.agreed_reward_cents, 0) <= 0 then true
    when j.connection_id is null then false
    else exists (
      select 1 from public.connection_payments p
      where p.connection_id = j.connection_id
        and p.status in ('secured','released')
    )
  end
  from public.delivery_jobs j
  where j.id = p_delivery_job_id;
$$;

create or replace function public.delivery_set_status(p_delivery_job_id uuid, p_next_status text)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into j from public.delivery_jobs where id = p_delivery_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if auth.uid() <> j.matched_aspirer_id then raise exception 'NOT_MATCHED_ASPIRER'; end if;

  if not (
    (j.status = 'matched' and p_next_status = 'heading_to_pickup')
    or (j.status = 'picked_up' and p_next_status = 'on_the_way')
  ) then
    raise exception 'INVALID_DELIVERY_TRANSITION';
  end if;

  if j.status = 'matched' and p_next_status = 'heading_to_pickup'
     and not coalesce(public.delivery_payment_is_secured(j.id), false)
  then
    raise exception 'DELIVERY_PAYMENT_NOT_SECURED';
  end if;

  update public.delivery_jobs
  set status = p_next_status, updated_at = now()
  where id = j.id
  returning * into j;
  return j;
end;
$$;

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
    if not coalesce(public.delivery_payment_is_secured(j.id), false) then raise exception 'DELIVERY_PAYMENT_NOT_SECURED'; end if;
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
  return jsonb_build_object('ok',true,'status',j.status);
end;
$$;

revoke all on function public.delivery_payment_is_secured(uuid) from public, anon, authenticated;
revoke all on function public.delivery_set_status(uuid,text) from public, anon;
revoke all on function public.delivery_verify_confirmation_code(uuid,text,text) from public, anon;
grant execute on function public.delivery_set_status(uuid,text) to authenticated, service_role;
grant execute on function public.delivery_verify_confirmation_code(uuid,text,text) to authenticated, service_role;
