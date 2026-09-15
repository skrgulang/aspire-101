-- Reduce duplicate/noisy delivery notifications.
-- Offer notifications should fire only for meaningful offer changes, and the actor who
-- caused a match should not immediately receive a redundant "matched" notification.

create or replace function public.notify_delivery_offer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.delivery_jobs;
begin
  select * into j from public.delivery_jobs where id = new.delivery_job_id;
  if not found then return new; end if;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.push_delivery_notification(
      j.requester_id,
      'delivery_offer',
      'delivery-offer:'||new.id::text,
      'New Aspirer delivery offer',
      'An Aspirer made an offer on your delivery request.',
      j.id,
      new.aspirer_id,
      j.request_id,
      j.connection_id
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    old.status is distinct from new.status
    or old.amount_cents is distinct from new.amount_cents
    or old.message is distinct from new.message
    or old.last_actor_id is distinct from new.last_actor_id
  ) then
    if new.status = 'countered' and new.last_actor_id = j.requester_id then
      perform public.push_delivery_notification(
        new.aspirer_id,
        'delivery_counter',
        'delivery-counter:'||new.id::text||':'||new.amount_cents::text,
        'Requester sent a counteroffer',
        'Open the delivery to review the new reward amount.',
        j.id,
        j.requester_id,
        j.request_id,
        j.connection_id
      );
    elsif new.status = 'pending' and new.last_actor_id = new.aspirer_id then
      perform public.push_delivery_notification(
        j.requester_id,
        'delivery_offer',
        'delivery-offer-update:'||new.id::text||':'||new.amount_cents::text||':'||md5(coalesce(new.message,'')),
        'Delivery offer updated',
        'An Aspirer updated their delivery offer.',
        j.id,
        new.aspirer_id,
        j.request_id,
        j.connection_id
      );
    end if;
  end if;

  -- Accepted-offer notifications are intentionally omitted here. The delivery_jobs
  -- status transition to matched owns the single source of truth for match notifications.
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
    if new.requester_id is not null and new.requester_id is distinct from v_actor then
      perform public.push_delivery_notification(
        new.requester_id,
        'delivery_matched',
        'delivery-matched:'||new.id::text||':'||new.requester_id::text,
        'Aspirer matched',
        coalesce('Delivery matched for “'||v_title||'”.','Your delivery is matched.'),
        new.id,
        v_actor,
        new.request_id,
        new.connection_id
      );
    end if;
    if new.matched_aspirer_id is not null and new.matched_aspirer_id is distinct from v_actor then
      perform public.push_delivery_notification(
        new.matched_aspirer_id,
        'delivery_matched',
        'delivery-matched:'||new.id::text||':'||new.matched_aspirer_id::text,
        'You are matched to a delivery',
        coalesce('You were chosen for “'||v_title||'”.','Open the delivery for next steps.'),
        new.id,
        v_actor,
        new.request_id,
        new.connection_id
      );
    end if;
  elsif new.status = 'heading_to_pickup' then
    if new.pickup_party_id is not null and new.pickup_party_id is distinct from v_actor then
      perform public.push_delivery_notification(
        new.pickup_party_id,'delivery_status','delivery-heading:'||new.id::text||':'||new.pickup_party_id::text,
        'Aspirer is heading to pickup','Prepare the pickup handoff and one-time code.',
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
  elsif new.status = 'picked_up' then
    if new.dropoff_party_id is not null and new.dropoff_party_id is distinct from v_actor then
      perform public.push_delivery_notification(
        new.dropoff_party_id,'delivery_status','delivery-picked-up:'||new.id::text||':'||new.dropoff_party_id::text,
        'Delivery picked up','Your item has been picked up and is moving to drop-off.',
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
  elsif new.status = 'on_the_way' then
    if new.dropoff_party_id is not null and new.dropoff_party_id is distinct from v_actor then
      perform public.push_delivery_notification(
        new.dropoff_party_id,'delivery_status','delivery-on-way:'||new.id::text||':'||new.dropoff_party_id::text,
        'Aspirer is on the way','Prepare to receive the item and show the delivery code only after handoff.',
        new.id,v_actor,new.request_id,new.connection_id
      );
    end if;
  elsif new.status = 'delivered' then
    foreach v_user in array array[new.requester_id,new.dropoff_party_id] loop
      if v_user is not null and v_user is distinct from v_actor then
        perform public.push_delivery_notification(
          v_user,'delivery_status','delivery-delivered:'||new.id::text||':'||v_user::text,
          'Delivery marked delivered','Confirm receipt after you verify the handoff.',
          new.id,v_actor,new.request_id,new.connection_id
        );
      end if;
    end loop;
  elsif new.status = 'completed' then
    foreach v_user in array array[new.requester_id,new.matched_aspirer_id,new.dropoff_party_id] loop
      if v_user is not null and v_user is distinct from v_actor then
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
