create or replace function public.set_connection_coordination_status(p_connection_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_connection public.connections;
  v_body text;
  v_current_rank integer;
  v_next_rank integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('on_the_way','arrived','in_progress') then raise exception 'Invalid coordination status'; end if;

  select * into v_connection from public.connections where id = p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not active'; end if;
  if public.connection_pair_is_blocked(v_connection.requester_id, v_connection.responder_id) then
    raise exception 'Connection coordination is unavailable while either participant has blocked the other';
  end if;

  v_current_rank := case v_connection.coordination_status
    when 'on_the_way' then 1
    when 'arrived' then 2
    when 'in_progress' then 3
    else 0
  end;
  v_next_rank := case p_status
    when 'on_the_way' then 1
    when 'arrived' then 2
    when 'in_progress' then 3
    else 0
  end;

  if v_next_rank < v_current_rank then
    raise exception 'Connection progress cannot move backward';
  end if;
  if v_next_rank = v_current_rank and v_current_rank > 0 then
    return;
  end if;

  if p_status = 'in_progress'
     and v_connection.scheduled_start_at is not null
     and now() < v_connection.scheduled_start_at then
    raise exception 'Task cannot start before the agreed start time';
  end if;

  v_body := case p_status
    when 'on_the_way' then 'On the way.'
    when 'arrived' then 'Arrived at the meeting point.'
    else 'Task started.'
  end;

  update public.connections set
    status = case when status = 'confirmed' then 'active' else status end,
    coordination_status = p_status,
    last_coordination_actor_id = auth.uid(),
    last_coordination_at = now(),
    updated_at = now()
  where id = p_connection_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body)
  values (p_connection_id,auth.uid(),p_status,v_body);
end;
$fn$;

create or replace function public.record_connection_attendance_update(p_connection_id uuid, p_update text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_connection public.connections;
  v_body text;
  v_other uuid;
  v_event_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_update not in ('running_late','cannot_make_it') then raise exception 'Invalid attendance update'; end if;
  select * into v_connection from public.connections where id=p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not active'; end if;
  if public.connection_pair_is_blocked(v_connection.requester_id, v_connection.responder_id) then
    raise exception 'Connection coordination is unavailable while either participant has blocked the other';
  end if;

  if exists (
    select 1 from public.connection_events e
    where e.connection_id=p_connection_id
      and e.actor_id=auth.uid()
      and e.event_type=p_update
      and e.created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  v_other := case when auth.uid()=v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;
  v_body := case p_update when 'running_late' then 'Running late. Please check chat for coordination.' else 'Can’t make the agreed time. Please coordinate next steps in chat.' end;
  update public.connections set last_coordination_actor_id=auth.uid(), last_coordination_at=now(), updated_at=now() where id=p_connection_id;
  insert into public.connection_events(connection_id,actor_id,event_type,body) values (p_connection_id,auth.uid(),p_update,v_body) returning id into v_event_id;
  perform public.push_notification(
    v_other,'connection_coordination','attendance:'||v_event_id::text,
    case when p_update='running_late' then 'Your Aspire connection is running late' else 'Your Aspire connection can’t make the agreed time' end,
    v_body,auth.uid(),v_connection.request_id,null,p_connection_id,null
  );
end;
$fn$;

create or replace function public.propose_connection_schedule(p_connection_id uuid, p_start_at timestamp with time zone, p_timezone text, p_meeting_label text default null::text, p_end_at timestamp with time zone default null::timestamp with time zone)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_connection public.connections;
  v_proposal_id uuid;
  v_other uuid;
  v_label text;
  v_timezone text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_at is null then raise exception 'Start time required'; end if;
  if p_start_at < now() - interval '5 minutes' then raise exception 'Proposed start time cannot be in the past'; end if;
  if p_end_at is not null and p_end_at <= p_start_at then raise exception 'End time must be after start time'; end if;
  if p_end_at is not null and p_end_at <= now() then raise exception 'Proposed end time must still be in the future'; end if;

  select * into v_connection
  from public.connections
  where id = p_connection_id
  for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not ready for scheduling'; end if;
  if public.connection_pair_is_blocked(v_connection.requester_id, v_connection.responder_id) then
    raise exception 'Connection coordination is unavailable while either participant has blocked the other';
  end if;
  if v_connection.coordination_status = 'in_progress' then raise exception 'The task has already started, so the agreed schedule can no longer change'; end if;

  v_other := case when auth.uid() = v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;
  v_label := nullif(left(btrim(coalesce(p_meeting_label,'')),240),'');
  v_timezone := nullif(left(btrim(coalesce(p_timezone,'')),100),'');

  select id into v_proposal_id
  from public.connection_schedule_proposals
  where connection_id=p_connection_id
    and proposed_by=auth.uid()
    and status='pending'
    and start_at=p_start_at
    and end_at is not distinct from p_end_at
    and timezone is not distinct from v_timezone
    and meeting_label is not distinct from v_label
  order by created_at desc
  limit 1;
  if found then return v_proposal_id; end if;

  update public.connection_schedule_proposals
  set status = 'superseded', responded_at = now(), updated_at = now()
  where connection_id = p_connection_id and status = 'pending';

  insert into public.connection_schedule_proposals(connection_id, proposed_by, start_at, end_at, timezone, meeting_label)
  values (p_connection_id, auth.uid(), p_start_at, p_end_at, v_timezone, v_label)
  returning id into v_proposal_id;

  insert into public.connection_events(connection_id, actor_id, event_type, body, metadata)
  values (
    p_connection_id, auth.uid(), 'schedule_proposed',
    case when v_label is null then 'Proposed a new meeting time.' else 'Proposed a new meeting time and place.' end,
    jsonb_build_object('proposal_id',v_proposal_id,'scheduled_start_at',p_start_at,'scheduled_end_at',p_end_at,'timezone',v_timezone,'meeting_label',v_label)
  );

  perform public.push_notification(
    v_other,'connection_coordination','schedule-proposal:' || v_proposal_id::text,
    'New time proposed for your Aspire connection',
    'Review the proposed time and accept it before it becomes the agreed schedule.',
    auth.uid(),v_connection.request_id,null,p_connection_id,null
  );
  return v_proposal_id;
end;
$fn$;

create or replace function public.respond_connection_schedule(p_proposal_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_proposal public.connection_schedule_proposals;
  v_connection public.connections;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_status := case when p_accept then 'accepted' else 'declined' end;

  select * into v_proposal
  from public.connection_schedule_proposals
  where id = p_proposal_id
  for update;
  if not found then raise exception 'Schedule proposal not found'; end if;

  if v_proposal.status <> 'pending' then
    if v_proposal.responded_by = auth.uid() and v_proposal.status = v_status then
      return v_proposal.status;
    end if;
    raise exception 'This schedule proposal is no longer pending';
  end if;

  select * into v_connection from public.connections where id = v_proposal.connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if auth.uid() = v_proposal.proposed_by then raise exception 'The other participant must respond to this proposal'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not active'; end if;
  if public.connection_pair_is_blocked(v_connection.requester_id, v_connection.responder_id) then
    raise exception 'Connection coordination is unavailable while either participant has blocked the other';
  end if;
  if p_accept and v_connection.coordination_status = 'in_progress' then raise exception 'The task has already started, so a new schedule can no longer be accepted'; end if;
  if p_accept and v_proposal.start_at < now() - interval '5 minutes' then raise exception 'This proposed start time has already passed. Ask for a new time.'; end if;
  if p_accept and v_proposal.end_at is not null and v_proposal.end_at <= now() then raise exception 'This proposed end time has already passed. Ask for a new time.'; end if;

  update public.connection_schedule_proposals
  set status=v_status, responded_by=auth.uid(), responded_at=now(), updated_at=now()
  where id=p_proposal_id;

  if p_accept then
    update public.connections
    set scheduled_start_at=v_proposal.start_at,
        scheduled_end_at=v_proposal.end_at,
        timezone=v_proposal.timezone,
        meeting_label=v_proposal.meeting_label,
        coordination_status='scheduled',
        last_coordination_actor_id=auth.uid(),
        last_coordination_at=now(),
        updated_at=now()
    where id=v_proposal.connection_id;

    insert into public.connection_events(connection_id, actor_id, event_type, body, metadata)
    values (
      v_proposal.connection_id,auth.uid(),'schedule_set',
      'Accepted the proposed meeting time. The agreed schedule was updated.',
      jsonb_build_object('proposal_id',p_proposal_id,'scheduled_start_at',v_proposal.start_at,'scheduled_end_at',v_proposal.end_at,'timezone',v_proposal.timezone,'meeting_label',v_proposal.meeting_label,'proposed_by',v_proposal.proposed_by,'accepted_by',auth.uid())
    );
  else
    insert into public.connection_events(connection_id, actor_id, event_type, body, metadata)
    values (
      v_proposal.connection_id,auth.uid(),'schedule_declined',
      'Declined the proposed time. The current agreed schedule did not change.',
      jsonb_build_object('proposal_id',p_proposal_id,'proposed_by',v_proposal.proposed_by,'declined_by',auth.uid())
    );
  end if;

  perform public.push_notification(
    v_proposal.proposed_by,'connection_coordination','schedule-response:' || p_proposal_id::text || ':' || v_status,
    case when p_accept then 'Your proposed time was accepted' else 'Your proposed time was declined' end,
    case when p_accept then 'The new time is now the agreed Aspire schedule.' else 'The existing agreed time remains unchanged. Use chat to coordinate another option.' end,
    auth.uid(),v_connection.request_id,null,v_proposal.connection_id,null
  );
  return v_status;
end;
$fn$;

create or replace function public.open_connection_resolution_case(p_connection_id uuid, p_reason text, p_details text default null::text, p_requested_resolution text default 'review'::text, p_against_user_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_connection public.connections;
  v_case_id uuid;
  v_against uuid;
  v_payment_status text;
  v_payment_total integer;
  v_currency text;
  v_events jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_reason not in ('no_show','cancellation','incomplete','not_as_described','payment','safety','other') then raise exception 'Invalid issue type'; end if;
  if p_requested_resolution not in ('refund','provider_compensation','partial','review','safety_review') then raise exception 'Invalid requested resolution'; end if;

  select * into v_connection from public.connections where id=p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active','completed','cancelled') then raise exception 'This connection is not eligible for a resolution case'; end if;

  select id into v_case_id from public.connection_resolution_cases
  where connection_id=p_connection_id and status in ('submitted','under_review')
  order by created_at desc limit 1;
  if found then return v_case_id; end if;

  v_against := coalesce(p_against_user_id,case when auth.uid()=v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end);
  if v_against=auth.uid() then raise exception 'You cannot file a case against yourself'; end if;
  if v_against<>v_connection.requester_id and v_against<>v_connection.responder_id then raise exception 'The reported account is not part of this connection'; end if;

  if p_reason='no_show' then
    if v_connection.scheduled_start_at is null then raise exception 'Set an agreed meeting time before reporting a no-show'; end if;
    if now() < v_connection.scheduled_start_at + interval '10 minutes' then raise exception 'NO_SHOW_GRACE_PERIOD'; end if;
  end if;

  select cp.status,coalesce(cp.customer_total_cents,cp.gross_amount_cents),cp.currency
  into v_payment_status,v_payment_total,v_currency
  from public.connection_payments cp where cp.connection_id=p_connection_id limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'actor_id',e.actor_id,'body',e.body,'created_at',e.created_at) order by e.created_at),'[]'::jsonb)
  into v_events
  from (select event_type,actor_id,body,created_at from public.connection_events where connection_id=p_connection_id order by created_at desc limit 25) e;

  insert into public.connection_resolution_cases(
    connection_id,request_id,opened_by,against_user_id,reason,requested_resolution,details,
    payment_status_snapshot,payment_total_cents_snapshot,currency_snapshot,
    scheduled_start_snapshot,meeting_label_snapshot,coordination_status_snapshot,evidence_snapshot
  ) values (
    p_connection_id,v_connection.request_id,auth.uid(),v_against,p_reason,p_requested_resolution,
    nullif(left(btrim(coalesce(p_details,'')),2000),''),
    v_payment_status,v_payment_total,v_currency,
    v_connection.scheduled_start_at,v_connection.meeting_label,v_connection.coordination_status,
    jsonb_build_object('captured_at',now(),'connection_status',v_connection.status,'last_coordination_actor_id',v_connection.last_coordination_actor_id,'last_coordination_at',v_connection.last_coordination_at,'events',coalesce(v_events,'[]'::jsonb))
  ) returning id into v_case_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (p_connection_id,auth.uid(),'issue_opened','An Aspire Resolution Center case was opened. Payment release is paused while the issue is open.',jsonb_build_object('case_id',v_case_id,'reason',p_reason));
  return v_case_id;
end;
$fn$;

create or replace function public.add_connection_resolution_response(p_case_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_case public.connection_resolution_cases;
  v_connection public.connections;
  v_response_id uuid;
  v_clean text;
  v_count integer;
  v_other uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_clean := nullif(left(btrim(coalesce(p_body,'')),2000),'');
  if v_clean is null then raise exception 'Response is required'; end if;

  select * into v_case from public.connection_resolution_cases where id=p_case_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_case.status not in ('submitted','under_review') then raise exception 'This case is already closed'; end if;

  select * into v_connection from public.connections where id=v_case.connection_id;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  v_other := case when auth.uid()=v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;

  select id into v_response_id from public.connection_resolution_responses
  where case_id=p_case_id and author_id=auth.uid() and body=v_clean and created_at > now() - interval '30 seconds'
  order by created_at desc limit 1;
  if found then return v_response_id; end if;

  select count(*) into v_count from public.connection_resolution_responses where case_id=p_case_id and author_id=auth.uid();
  if v_count >= 10 then raise exception 'Too many updates for this case. Wait for Aspire review.'; end if;

  insert into public.connection_resolution_responses(case_id,connection_id,author_id,body)
  values (p_case_id,v_case.connection_id,auth.uid(),v_clean)
  returning id into v_response_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (v_case.connection_id,auth.uid(),'issue_response','Added information to the Resolution Center case.',jsonb_build_object('case_id',p_case_id,'response_id',v_response_id));

  perform public.push_notification(
    v_other,'resolution_case','resolution-response:'||v_response_id::text,
    'New update on your Resolution Center case',
    'The other participant added information. Open Resolution Center to review the case.',
    auth.uid(),v_case.request_id,null,v_case.connection_id,null
  );
  return v_response_id;
end;
$fn$;

create or replace function public.confirm_connection_completion(p_connection_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_connection public.connections;
  v_count integer;
  v_is_marketplace boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_connection from public.connections where id=p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;

  if v_connection.status='completed' then
    if not exists (select 1 from public.connection_completion_confirmations where connection_id=p_connection_id and user_id=auth.uid()) then
      raise exception 'Connection is already completed';
    end if;
    select count(*)::integer into v_count from public.connection_completion_confirmations
    where connection_id=p_connection_id and user_id in (v_connection.requester_id,v_connection.responder_id);
    return v_count;
  end if;

  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not ready for completion'; end if;

  if coalesce(v_connection.coordination_status,'') <> 'in_progress' then
    if v_connection.scheduled_end_at is not null then
      if now() < v_connection.scheduled_end_at then raise exception 'Activity is not ready for completion'; end if;
    elsif v_connection.scheduled_start_at is not null then
      if now() < v_connection.scheduled_start_at then raise exception 'Activity is not ready for completion'; end if;
    else
      raise exception 'Start the activity before confirming completion';
    end if;
  end if;

  insert into public.connection_completion_confirmations(connection_id,user_id)
  values (p_connection_id,auth.uid())
  on conflict (connection_id,user_id) do nothing;

  select count(*)::integer into v_count from public.connection_completion_confirmations
  where connection_id=p_connection_id and user_id in (v_connection.requester_id,v_connection.responder_id);

  select exists(select 1 from public.market_orders mo where mo.connection_id=p_connection_id) into v_is_marketplace;
  if v_count >= 2 and not v_is_marketplace then
    update public.connections set status='completed',updated_at=now() where id=p_connection_id and status<>'cancelled';
    update public.requests set status='completed',updated_at=now() where id=v_connection.request_id and status not in ('completed','cancelled');
  end if;
  return v_count;
end;
$fn$;

create or replace function public.cancel_connection_with_protection(p_connection_id uuid, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_connection public.connections;
  v_payment public.connection_payments;
  v_has_payment boolean := false;
  v_other uuid;
  v_case_id uuid;
  v_existing_case_id uuid;
  v_clean_note text;
  v_events jsonb;
  v_review_required boolean := false;
  v_cancel_payment_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_clean_note := nullif(left(btrim(coalesce(p_note,'')),1000),'');
  select * into v_connection from public.connections where id=p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;

  if v_connection.status='cancelled' then
    select payment_status_snapshot into v_cancel_payment_status from public.connection_cancellations where connection_id=p_connection_id;
    select id into v_case_id from public.connection_resolution_cases
    where connection_id=p_connection_id and status in ('submitted','under_review')
    order by created_at desc limit 1;
    return jsonb_build_object('status','cancelled','resolution_case_id',v_case_id,'review_required',v_case_id is not null,'payment_status',v_cancel_payment_status,'already_cancelled',true);
  end if;

  if v_connection.status not in ('pending','confirmed','active') then raise exception 'This connection is no longer active'; end if;
  v_other := case when auth.uid()=v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;

  select * into v_payment from public.connection_payments where connection_id=p_connection_id limit 1;
  v_has_payment := found;
  if v_has_payment and v_payment.status in ('processing','checkout_created') then raise exception 'PAYMENT_STILL_PROCESSING'; end if;
  if v_has_payment and v_payment.status in ('released','disputed') then raise exception 'PAYMENT_NEEDS_RESOLUTION_CENTER'; end if;

  select id into v_existing_case_id from public.connection_resolution_cases
  where connection_id=p_connection_id and status in ('submitted','under_review')
  order by created_at desc limit 1;

  if v_has_payment and v_payment.status='secured' then
    v_review_required := true;
    if v_existing_case_id is not null then
      v_case_id := v_existing_case_id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'actor_id',e.actor_id,'body',e.body,'created_at',e.created_at) order by e.created_at),'[]'::jsonb)
      into v_events
      from (select event_type,actor_id,body,created_at from public.connection_events where connection_id=p_connection_id order by created_at desc limit 25) e;
      insert into public.connection_resolution_cases(
        connection_id,request_id,opened_by,against_user_id,reason,requested_resolution,details,
        payment_status_snapshot,payment_total_cents_snapshot,currency_snapshot,
        scheduled_start_snapshot,meeting_label_snapshot,coordination_status_snapshot,evidence_snapshot
      ) values (
        p_connection_id,v_connection.request_id,auth.uid(),null,'cancellation','review',v_clean_note,
        v_payment.status,coalesce(v_payment.customer_total_cents,v_payment.gross_amount_cents),v_payment.currency,
        v_connection.scheduled_start_at,v_connection.meeting_label,v_connection.coordination_status,
        jsonb_build_object('captured_at',now(),'connection_status',v_connection.status,'cancellation_actor_id',auth.uid(),'voluntary_cancellation',true,'last_coordination_actor_id',v_connection.last_coordination_actor_id,'last_coordination_at',v_connection.last_coordination_at,'events',coalesce(v_events,'[]'::jsonb))
      ) returning id into v_case_id;
    end if;
  end if;

  insert into public.connection_cancellations(connection_id,cancelled_by,note,payment_status_snapshot)
  values (p_connection_id,auth.uid(),v_clean_note,case when v_has_payment then v_payment.status else null end)
  on conflict (connection_id) do update set note=coalesce(excluded.note,public.connection_cancellations.note),payment_status_snapshot=excluded.payment_status_snapshot;

  delete from public.connection_live_locations where connection_id=p_connection_id;
  update public.connections set status='cancelled',last_coordination_actor_id=auth.uid(),last_coordination_at=now(),updated_at=now() where id=p_connection_id;
  update public.requests set status='cancelled',updated_at=now() where id=v_connection.request_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    p_connection_id,auth.uid(),'connection_cancelled',
    case when v_review_required then 'Cancelled the connection. Protected payment review is required before any payout or refund.' else 'Cancelled the connection.' end,
    jsonb_build_object('note',v_clean_note,'resolution_case_id',v_case_id,'protected_payment_review',v_review_required)
  );

  perform public.push_notification(
    v_other,'connection_cancelled','participant-cancelled:'||p_connection_id::text||':'||auth.uid()::text,
    'Your Aspire connection was cancelled',
    case when v_review_required then 'The other participant cancelled. A protected payment review is open, so provider payout stays paused.' else 'The other participant cancelled this connection. Open Aspire to review the activity record.' end,
    auth.uid(),v_connection.request_id,null,p_connection_id,null
  );

  return jsonb_build_object('status','cancelled','resolution_case_id',v_case_id,'review_required',v_review_required,'payment_status',case when v_has_payment then v_payment.status else null end);
end;
$fn$;

create or replace function public.request_payment_refund(p_connection_id uuid, p_reason text, p_details text)
returns payment_refund_requests
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  p public.connection_payments;
  r public.payment_refund_requests;
  anchor_ts timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_reason not in ('not_received','not_as_described','service_not_completed','wrong_charge','unsafe_or_cancelled','other') then raise exception 'INVALID_REFUND_REASON'; end if;
  if char_length(btrim(coalesce(p_details,''))) < 10 then raise exception 'REFUND_DETAILS_REQUIRED'; end if;

  select * into p from public.connection_payments where connection_id=p_connection_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if auth.uid() <> p.payer_id then raise exception 'ONLY_PAYER_CAN_REQUEST_REFUND'; end if;
  if p.status not in ('secured','released') then raise exception 'REFUND_REQUEST_NOT_AVAILABLE'; end if;

  select * into r from public.payment_refund_requests
  where payment_id=p.id and requested_by=auth.uid() and status in ('open','under_review')
  order by created_at desc limit 1;
  if found then return r; end if;

  anchor_ts := coalesce(p.released_at,p.paid_at,p.updated_at);
  if anchor_ts < now() - interval '7 days' then raise exception 'REFUND_REVIEW_WINDOW_CLOSED'; end if;

  insert into public.payment_refund_requests(payment_id,connection_id,requested_by,reason,details,requested_amount_cents)
  values (p.id,p.connection_id,auth.uid(),p_reason,btrim(p_details),coalesce(p.customer_total_cents,p.gross_amount_cents))
  returning * into r;
  return r;
end;
$fn$;
