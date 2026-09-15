-- Delivery notifications plus safe cancellation/offer withdrawal for Flexible Fulfillment.
-- Direct cancellation is intentionally limited to pre-match delivery jobs. Once matched,
-- participants must use the existing Resolution Center / connection cancellation flow so
-- protected payment state cannot be bypassed.

alter table public.notifications
  add column if not exists delivery_job_id uuid null references public.delivery_jobs(id) on delete set null;

create index if not exists notifications_delivery_job_idx
  on public.notifications(delivery_job_id, created_at desc)
  where delivery_job_id is not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'request_response','connection_chosen','connection_confirmed','connection_completed','connection_cancelled','message','circle_mutual',
    'delivery_offer','delivery_counter','delivery_matched','delivery_status','delivery_cancelled'
  ));

create or replace function public.push_delivery_notification(
  p_user_id uuid,
  p_kind text,
  p_event_key text,
  p_title text,
  p_body text default null,
  p_delivery_job_id uuid default null,
  p_actor_id uuid default null,
  p_request_id uuid default null,
  p_connection_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if p_user_id is null or p_event_key is null or btrim(p_event_key) = '' then return null; end if;
  insert into public.notifications(
    user_id,kind,actor_id,request_id,connection_id,delivery_job_id,event_key,title,body
  ) values (
    p_user_id,p_kind,p_actor_id,p_request_id,p_connection_id,p_delivery_job_id,
    left(p_event_key,220),left(btrim(p_title),140),nullif(left(btrim(coalesce(p_body,'')),360),'')
  )
  on conflict (user_id,event_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.push_delivery_notification(uuid,text,text,text,text,uuid,uuid,uuid,uuid) from public;

create or replace function public.delivery_cancel_open_request(p_delivery_job_id uuid)
returns public.delivery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
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
  returning * into j;

  update public.requests
  set status = 'cancelled', updated_at = now()
  where id = j.request_id
    and poster_id = auth.uid()
    and status in ('open','matched','in_progress');

  return j;
end;
$$;
revoke all on function public.delivery_cancel_open_request(uuid) from public;
grant execute on function public.delivery_cancel_open_request(uuid) to authenticated;

create or replace function public.delivery_withdraw_offer(p_offer_id uuid)
returns public.delivery_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.delivery_offers;
  j public.delivery_jobs;
  v_has_active boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into o
  from public.delivery_offers
  where id = p_offer_id
  for update;

  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if o.aspirer_id <> auth.uid() then raise exception 'NOT_OFFER_OWNER'; end if;
  if o.status = 'withdrawn' then return o; end if;
  if o.status not in ('pending','countered') then raise exception 'OFFER_NOT_ACTIVE'; end if;

  select * into j
  from public.delivery_jobs
  where id = o.delivery_job_id
  for update;

  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
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
revoke all on function public.delivery_withdraw_offer(uuid) from public;
grant execute on function public.delivery_withdraw_offer(uuid) to authenticated;

create or replace function public.notify_delivery_offer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
  v_actor uuid;
begin
  select * into j from public.delivery_jobs where id = new.delivery_job_id;
  if not found then return new; end if;
  v_actor := new.last_actor_id;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.push_delivery_notification(
      j.requester_id,'delivery_offer','delivery-offer:'||new.id::text||':'||new.updated_at::text,
      'New Aspirer delivery offer',
      'An Aspirer made an offer on your delivery request.',j.id,new.aspirer_id,j.request_id,j.connection_id
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    old.status is distinct from new.status
    or old.amount_cents is distinct from new.amount_cents
    or old.updated_at is distinct from new.updated_at
  ) then
    if new.status = 'countered' and new.last_actor_id = j.requester_id then
      perform public.push_delivery_notification(
        new.aspirer_id,'delivery_counter','delivery-counter:'||new.id::text||':'||new.updated_at::text,
        'Requester sent a counteroffer',
        'Open the delivery to review the new reward amount.',j.id,j.requester_id,j.request_id,j.connection_id
      );
    elsif new.status = 'pending' and new.last_actor_id = new.aspirer_id then
      perform public.push_delivery_notification(
        j.requester_id,'delivery_offer','delivery-offer-update:'||new.id::text||':'||new.updated_at::text,
        'Delivery offer updated',
        'An Aspirer updated their delivery offer.',j.id,new.aspirer_id,j.request_id,j.connection_id
      );
    elsif new.status = 'accepted' and old.status <> 'accepted' then
      perform public.push_delivery_notification(
        new.aspirer_id,'delivery_matched','delivery-offer-accepted:'||new.id::text,
        'Your delivery offer was accepted',
        'You are matched. Open the delivery for pickup instructions and next steps.',j.id,j.requester_id,j.request_id,j.connection_id
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_delivery_offer_change() from public;
drop trigger if exists notify_delivery_offer_after_change on public.delivery_offers;
create trigger notify_delivery_offer_after_change
after insert or update on public.delivery_offers
for each row execute function public.notify_delivery_offer_change();

create or replace function public.notify_delivery_job_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_user uuid;
  v_title text;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then return new; end if;
  select title into v_title from public.requests where id = new.request_id;

  if new.status = 'matched' then
    if new.requester_id is not null then
      perform public.push_delivery_notification(
        new.requester_id,'delivery_matched','delivery-matched:'||new.id::text||':'||new.requester_id::text,
        'Aspirer matched',coalesce('Delivery matched for “'||v_title||'”.','Your delivery is matched.'),
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
    if new.matched_aspirer_id is not null then
      perform public.push_delivery_notification(
        new.matched_aspirer_id,'delivery_matched','delivery-matched:'||new.id::text||':'||new.matched_aspirer_id::text,
        'You are matched to a delivery',coalesce('You were chosen for “'||v_title||'”.','Open the delivery for next steps.'),
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
  elsif new.status = 'heading_to_pickup' then
    if new.pickup_party_id is not null and new.pickup_party_id <> v_actor then
      perform public.push_delivery_notification(
        new.pickup_party_id,'delivery_status','delivery-heading:'||new.id::text||':'||new.pickup_party_id::text,
        'Aspirer is heading to pickup','Prepare the pickup handoff and one-time code.',
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
  elsif new.status = 'picked_up' then
    if new.dropoff_party_id is not null and new.dropoff_party_id <> v_actor then
      perform public.push_delivery_notification(
        new.dropoff_party_id,'delivery_status','delivery-picked-up:'||new.id::text||':'||new.dropoff_party_id::text,
        'Delivery picked up','Your item has been picked up and is moving to drop-off.',
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
  elsif new.status = 'on_the_way' then
    if new.dropoff_party_id is not null and new.dropoff_party_id <> v_actor then
      perform public.push_delivery_notification(
        new.dropoff_party_id,'delivery_status','delivery-on-way:'||new.id::text||':'||new.dropoff_party_id::text,
        'Aspirer is on the way','Prepare to receive the item and show the delivery code only after handoff.',
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
  elsif new.status = 'delivered' then
    foreach v_user in array array[new.requester_id,new.dropoff_party_id] loop
      if v_user is not null and v_user <> v_actor then
        perform public.push_delivery_notification(
          v_user,'delivery_status','delivery-delivered:'||new.id::text||':'||v_user::text,
          'Delivery marked delivered','Confirm receipt after you verify the handoff.',
          new.id,v_actor,new.request_id,new.connection_id
        );
      end if;
    end loop;
  elsif new.status = 'completed' then
    foreach v_user in array array[new.requester_id,new.matched_aspirer_id,new.dropoff_party_id] loop
      if v_user is not null then
        perform public.push_delivery_notification(
          v_user,'delivery_status','delivery-completed:'||new.id::text||':'||v_user::text,
          'Delivery completed','The delivery lifecycle is complete. Review history, rating, and any protected reward follow-up.',
          new.id,v_actor,new.request_id,new.connection_id
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_delivery_job_change() from public;
drop trigger if exists notify_delivery_job_after_change on public.delivery_jobs;
create trigger notify_delivery_job_after_change
after update on public.delivery_jobs
for each row execute function public.notify_delivery_job_change();
