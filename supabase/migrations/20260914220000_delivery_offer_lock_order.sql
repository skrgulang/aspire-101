-- Serialize delivery negotiation with a consistent lock order.
-- Every counter/accept/withdraw operation locks the parent delivery job first and then
-- the relevant offer. This avoids offer->job vs job->offer deadlock cycles during races
-- such as requester accept vs Aspirer withdraw/counter.

create or replace function public.delivery_counter_offer(p_offer_id uuid, p_amount_cents integer)
returns public.delivery_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  o public.delivery_offers;
  j public.delivery_jobs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount_cents < 0 then raise exception 'INVALID_REWARD'; end if;

  select delivery_job_id into v_job_id from public.delivery_offers where id = p_offer_id;
  if v_job_id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  select * into j from public.delivery_jobs where id = v_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  select * into o from public.delivery_offers where id = p_offer_id for update;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if o.delivery_job_id <> j.id then raise exception 'OFFER_JOB_MISMATCH'; end if;
  if j.requester_id <> auth.uid() then raise exception 'NOT_REQUESTER'; end if;
  if j.reward_mode <> 'negotiable' then raise exception 'REWARD_NOT_NEGOTIABLE'; end if;
  if j.status <> 'offer_received' or o.status not in ('pending','countered') then raise exception 'OFFER_NOT_ACTIVE'; end if;

  update public.delivery_offers
  set amount_cents = p_amount_cents,
      status = 'countered',
      last_actor_id = auth.uid(),
      updated_at = now()
  where id = o.id
  returning * into o;
  return o;
end;
$$;

create or replace function public.delivery_accept_offer(p_offer_id uuid)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  o public.delivery_offers;
  j public.delivery_jobs;
  r public.requests%rowtype;
  v_connection_id uuid;
  v_amount integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_user_interact(auth.uid()) then raise exception 'ACCOUNT_RESTRICTED'; end if;

  select delivery_job_id into v_job_id from public.delivery_offers where id = p_offer_id;
  if v_job_id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  select * into j from public.delivery_jobs where id = v_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  select * into o from public.delivery_offers where id = p_offer_id for update;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if o.delivery_job_id <> j.id then raise exception 'OFFER_JOB_MISMATCH'; end if;
  if j.status <> 'offer_received' or o.status not in ('pending','countered') then raise exception 'OFFER_NOT_ACTIVE'; end if;

  if o.last_actor_id = j.requester_id then
    if auth.uid() <> o.aspirer_id then raise exception 'WAITING_FOR_ASPIRER'; end if;
  elsif o.last_actor_id = o.aspirer_id then
    if auth.uid() <> j.requester_id then raise exception 'WAITING_FOR_REQUESTER'; end if;
  else
    raise exception 'INVALID_OFFER_STATE';
  end if;

  select * into r from public.requests where id = j.request_id for update;
  if r.moderation_status <> 'approved' or r.status <> 'open' then raise exception 'DELIVERY_NOT_AVAILABLE'; end if;
  v_amount := o.amount_cents;

  if v_amount > 0 then
    update public.requests
    set kind = 'paid_help', amount_cents = v_amount, payment_method = 'aspire', updated_at = now()
    where id = r.id;
  else
    update public.requests
    set kind = 'community', amount_cents = null, payment_method = 'none', updated_at = now()
    where id = r.id;
  end if;

  insert into public.connections(
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, payment_method, agreed_terms
  ) values (
    r.id, j.requester_id, o.aspirer_id, true, true, 'active',
    case when v_amount > 0 then v_amount else null end,
    case when v_amount > 0 then 'aspire' else 'none' end,
    jsonb_build_object('source','aspirer_delivery','delivery_job_id',j.id,'reward_mode',j.reward_mode)
  ) returning id into v_connection_id;

  update public.requests set status = 'matched', updated_at = now() where id = r.id;
  update public.delivery_offers
  set status = case when id = o.id then 'accepted' else 'declined' end,
      last_actor_id = case when id = o.id then auth.uid() else last_actor_id end,
      updated_at = now()
  where delivery_job_id = j.id and status in ('pending','countered');

  update public.delivery_jobs
  set matched_aspirer_id = o.aspirer_id,
      connection_id = v_connection_id,
      agreed_reward_cents = v_amount,
      status = 'matched',
      updated_at = now()
  where id = j.id
  returning * into j;

  return j;
end;
$$;

create or replace function public.delivery_withdraw_offer(p_offer_id uuid)
returns public.delivery_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  o public.delivery_offers;
  j public.delivery_jobs;
  v_has_active boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select delivery_job_id into v_job_id from public.delivery_offers where id = p_offer_id;
  if v_job_id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  select * into j from public.delivery_jobs where id = v_job_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  select * into o from public.delivery_offers where id = p_offer_id for update;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if o.delivery_job_id <> j.id then raise exception 'OFFER_JOB_MISMATCH'; end if;
  if o.aspirer_id <> auth.uid() then raise exception 'NOT_OFFER_OWNER'; end if;
  if o.status = 'withdrawn' then return o; end if;
  if o.status not in ('pending','countered') then raise exception 'OFFER_NOT_ACTIVE'; end if;
  if j.status not in ('looking_for_aspirer','offer_received') or j.matched_aspirer_id is not null then
    raise exception 'DELIVERY_ALREADY_MATCHED';
  end if;

  update public.delivery_offers
  set status = 'withdrawn', last_actor_id = auth.uid(), updated_at = now()
  where id = o.id
  returning * into o;

  select exists(
    select 1 from public.delivery_offers
    where delivery_job_id = j.id
      and status in ('pending','countered')
  ) into v_has_active;

  update public.delivery_jobs
  set status = case when v_has_active then 'offer_received' else 'looking_for_aspirer' end,
      updated_at = now()
  where id = j.id;

  perform public.push_delivery_notification(
    j.requester_id,
    'delivery_offer',
    'delivery-offer-withdrawn:'||o.id::text,
    'A delivery offer was withdrawn',
    'An Aspirer withdrew their offer. Other active offers remain available.',
    j.id,
    auth.uid(),
    j.request_id,
    null
  );

  return o;
end;
$$;

revoke all on function public.delivery_counter_offer(uuid,integer) from public, anon;
revoke all on function public.delivery_accept_offer(uuid) from public, anon;
revoke all on function public.delivery_withdraw_offer(uuid) from public, anon;
grant execute on function public.delivery_counter_offer(uuid,integer) to authenticated, service_role;
grant execute on function public.delivery_accept_offer(uuid) to authenticated, service_role;
grant execute on function public.delivery_withdraw_offer(uuid) to authenticated, service_role;
