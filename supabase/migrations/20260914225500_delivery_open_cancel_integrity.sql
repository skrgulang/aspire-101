-- Final hardening for pre-match delivery cancellation.
-- Cancellation must remain strictly pre-match, with the parent request still open and no
-- connection already created for the request. Lock order stays delivery job -> request so
-- it is compatible with delivery_accept_offer's job-first serialization.

create or replace function public.delivery_cancel_open_request(p_delivery_job_id uuid)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  r public.requests%rowtype;
  o record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into j
  from public.delivery_jobs
  where id = p_delivery_job_id
  for update;

  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if j.requester_id <> auth.uid() then raise exception 'NOT_REQUESTER'; end if;
  if j.status = 'cancelled' then return j; end if;
  if j.status not in ('looking_for_aspirer','offer_received')
     or j.connection_id is not null
     or j.matched_aspirer_id is not null then
    raise exception 'MATCHED_DELIVERY_USE_RESOLUTION';
  end if;

  select * into r
  from public.requests
  where id = j.request_id
  for update;

  if not found then raise exception 'DELIVERY_REQUEST_NOT_FOUND'; end if;
  if r.poster_id <> auth.uid() then raise exception 'NOT_REQUESTER'; end if;
  if r.status <> 'open' then raise exception 'DELIVERY_NOT_AVAILABLE'; end if;

  if exists (
    select 1 from public.connections c
    where c.request_id = j.request_id
      and c.status in ('pending','confirmed','active','completed')
  ) then
    raise exception 'MATCHED_DELIVERY_USE_RESOLUTION';
  end if;

  for o in
    select distinct aspirer_id
    from public.delivery_offers
    where delivery_job_id = j.id
      and status in ('pending','countered')
  loop
    perform public.push_delivery_notification(
      o.aspirer_id,
      'delivery_cancelled',
      'delivery-cancelled:'||j.id::text||':'||o.aspirer_id::text,
      'Delivery request cancelled',
      'The requester cancelled this delivery before a match was finalized.',
      j.id,
      auth.uid(),
      j.request_id,
      null
    );
  end loop;

  update public.delivery_offers
  set status = 'declined', updated_at = now(), last_actor_id = auth.uid()
  where delivery_job_id = j.id
    and status in ('pending','countered');

  update public.delivery_jobs
  set status = 'cancelled', updated_at = now()
  where id = j.id
    and status in ('looking_for_aspirer','offer_received')
    and connection_id is null
    and matched_aspirer_id is null
  returning * into j;

  if not found then raise exception 'MATCHED_DELIVERY_USE_RESOLUTION'; end if;

  update public.requests
  set status = 'cancelled', updated_at = now()
  where id = r.id
    and status = 'open';

  return j;
end;
$$;

revoke all on function public.delivery_cancel_open_request(uuid) from public, anon;
grant execute on function public.delivery_cancel_open_request(uuid) to authenticated, service_role;
