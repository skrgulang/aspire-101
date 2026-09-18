-- Claim Stripe webhook events atomically so concurrent deliveries cannot both mutate payment state.
-- Failed or abandoned claims may be retried; an active claim gets a short lease.

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_event_type text;
  v_livemode boolean;
begin
  if nullif(btrim(coalesce(p_event_id, '')), '') is null
     or nullif(btrim(coalesce(p_event_type, '')), '') is null then
    raise exception 'INVALID_STRIPE_EVENT';
  end if;

  insert into public.stripe_webhook_events(
    event_id, event_type, livemode, status, received_at, processed_at, processing_error
  )
  values (
    p_event_id, p_event_type, coalesce(p_livemode, false), 'received', now(), null, null
  )
  on conflict (event_id) do nothing;

  if found then
    return 'claimed';
  end if;

  select status, event_type, livemode
    into v_status, v_event_type, v_livemode
  from public.stripe_webhook_events
  where event_id = p_event_id;

  if not found then
    return 'busy';
  end if;

  if v_event_type is distinct from p_event_type
     or v_livemode is distinct from coalesce(p_livemode, false) then
    raise exception 'STRIPE_EVENT_ID_MISMATCH';
  end if;

  if v_status = 'processed' then
    return 'processed';
  end if;

  if v_status = 'failed' then
    update public.stripe_webhook_events
    set status = 'received',
        received_at = now(),
        processed_at = null,
        processing_error = null
    where event_id = p_event_id
      and status = 'failed';
    if found then return 'claimed'; end if;
    return 'busy';
  end if;

  if v_status = 'received' then
    update public.stripe_webhook_events
    set received_at = now(),
        processing_error = null
    where event_id = p_event_id
      and status = 'received'
      and received_at <= now() - interval '10 minutes';
    if found then return 'claimed'; end if;
    return 'busy';
  end if;

  return 'busy';
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text,text,boolean) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text,text,boolean) to service_role;
