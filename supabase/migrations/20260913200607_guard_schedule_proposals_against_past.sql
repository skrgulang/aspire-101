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
set search_path to 'public', 'auth'
as $function$
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
$function$;

create or replace function public.respond_connection_schedule(p_proposal_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
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
$function$;
