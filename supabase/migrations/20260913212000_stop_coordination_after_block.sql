-- Blocking stops new coordination/contact activity while still allowing closeout,
-- cancellation and Resolution Center paths to finish safely.

create or replace function public.connection_pair_is_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = p_user_a and ub.blocked_id = p_user_b)
       or (ub.blocker_id = p_user_b and ub.blocked_id = p_user_a)
  );
$$;
revoke all on function public.connection_pair_is_blocked(uuid,uuid) from public;
revoke all on function public.connection_pair_is_blocked(uuid,uuid) from anon;
revoke all on function public.connection_pair_is_blocked(uuid,uuid) from authenticated;

create or replace function public.propose_connection_schedule(
  p_connection_id uuid,
  p_start_at timestamptz,
  p_timezone text,
  p_meeting_label text default null,
  p_end_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
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
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;
  if v_connection.status not in ('confirmed','active') then
    raise exception 'Connection is not ready for scheduling';
  end if;
  if public.connection_pair_is_blocked(v_connection.requester_id, v_connection.responder_id) then
    raise exception 'Connection coordination is unavailable while either participant has blocked the other';
  end if;
  if v_connection.coordination_status = 'in_progress' then
    raise exception 'The task has already started, so the agreed schedule can no longer change';
  end if;

  v_other := case
    when auth.uid() = v_connection.requester_id then v_connection.responder_id
    else v_connection.requester_id
  end;
  v_label := nullif(left(btrim(coalesce(p_meeting_label,'')),240),'');
  v_timezone := nullif(left(btrim(coalesce(p_timezone,'')),100),'');

  update public.connection_schedule_proposals
  set status = 'superseded', responded_at = now(), updated_at = now()
  where connection_id = p_connection_id and status = 'pending';

  insert into public.connection_schedule_proposals(
    connection_id, proposed_by, start_at, end_at, timezone, meeting_label
  ) values (
    p_connection_id, auth.uid(), p_start_at, p_end_at, v_timezone, v_label
  )
  returning id into v_proposal_id;

  insert into public.connection_events(connection_id, actor_id, event_type, body, metadata)
  values (
    p_connection_id,
    auth.uid(),
    'schedule_proposed',
    case when v_label is null then 'Proposed a new meeting time.' else 'Proposed a new meeting time and place.' end,
    jsonb_build_object(
      'proposal_id', v_proposal_id,
      'scheduled_start_at', p_start_at,
      'scheduled_end_at', p_end_at,
      'timezone', v_timezone,
      'meeting_label', v_label
    )
  );

  perform public.push_notification(
    v_other,
    'connection_coordination',
    'schedule-proposal:' || v_proposal_id::text,
    'New time proposed for your Aspire connection',
    'Review the proposed time and accept it before it becomes the agreed schedule.',
    auth.uid(),
    v_connection.request_id,
    null,
    p_connection_id,
    null
  );

  return v_proposal_id;
end;
$$;

create or replace function public.respond_connection_schedule(p_proposal_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_proposal public.connection_schedule_proposals;
  v_connection public.connections;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_proposal
  from public.connection_schedule_proposals
  where id = p_proposal_id
  for update;

  if not found then raise exception 'Schedule proposal not found'; end if;
  if v_proposal.status <> 'pending' then raise exception 'This schedule proposal is no longer pending'; end if;

  select * into v_connection
  from public.connections
  where id = v_proposal.connection_id
  for update;

  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;
  if auth.uid() = v_proposal.proposed_by then
    raise exception 'The other participant must respond to this proposal';
  end if;
  if v_connection.status not in ('confirmed','active') then
    raise exception 'Connection is not active';
  end if;
  if public.connection_pair_is_blocked(v_connection.requester_id, v_connection.responder_id) then
    raise exception 'Connection coordination is unavailable while either participant has blocked the other';
  end if;
  if p_accept and v_connection.coordination_status = 'in_progress' then
    raise exception 'The task has already started, so a new schedule can no longer be accepted';
  end if;
  if p_accept and v_proposal.start_at < now() - interval '5 minutes' then
    raise exception 'This proposed start time has already passed. Ask for a new time.';
  end if;
  if p_accept and v_proposal.end_at is not null and v_proposal.end_at <= now() then
    raise exception 'This proposed end time has already passed. Ask for a new time.';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.connection_schedule_proposals
  set status = v_status,
      responded_by = auth.uid(),
      responded_at = now(),
      updated_at = now()
  where id = p_proposal_id;

  if p_accept then
    update public.connections
    set scheduled_start_at = v_proposal.start_at,
        scheduled_end_at = v_proposal.end_at,
        timezone = v_proposal.timezone,
        meeting_label = v_proposal.meeting_label,
        coordination_status = 'scheduled',
        last_coordination_actor_id = auth.uid(),
        last_coordination_at = now(),
        updated_at = now()
    where id = v_proposal.connection_id;

    insert into public.connection_events(connection_id, actor_id, event_type, body, metadata)
    values (
      v_proposal.connection_id,
      auth.uid(),
      'schedule_set',
      'Accepted the proposed meeting time. The agreed schedule was updated.',
      jsonb_build_object(
        'proposal_id', p_proposal_id,
        'scheduled_start_at', v_proposal.start_at,
        'scheduled_end_at', v_proposal.end_at,
        'timezone', v_proposal.timezone,
        'meeting_label', v_proposal.meeting_label,
        'proposed_by', v_proposal.proposed_by,
        'accepted_by', auth.uid()
      )
    );
  else
    insert into public.connection_events(connection_id, actor_id, event_type, body, metadata)
    values (
      v_proposal.connection_id,
      auth.uid(),
      'schedule_declined',
      'Declined the proposed time. The current agreed schedule did not change.',
      jsonb_build_object(
        'proposal_id', p_proposal_id,
        'proposed_by', v_proposal.proposed_by,
        'declined_by', auth.uid()
      )
    );
  end if;

  perform public.push_notification(
    v_proposal.proposed_by,
    'connection_coordination',
    'schedule-response:' || p_proposal_id::text || ':' || v_status,
    case when p_accept then 'Your proposed time was accepted' else 'Your proposed time was declined' end,
    case when p_accept then 'The new time is now the agreed Aspire schedule.' else 'The existing agreed time remains unchanged. Use chat to coordinate another option.' end,
    auth.uid(),
    v_connection.request_id,
    null,
    v_proposal.connection_id,
    null
  );

  return v_status;
end;
$$;

create or replace function public.set_connection_coordination_status(p_connection_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.record_connection_attendance_update(p_connection_id uuid, p_update text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
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
$$;
