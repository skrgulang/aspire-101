-- Participant-initiated cancellation for Aspire Live.
-- This is intentionally different from a no-show report: the cancelling participant
-- is explicitly telling Aspire and the other person that they are ending the connection.
-- If a protected payment is already secured, payout stays paused behind a Resolution Center case.

alter table public.connection_events drop constraint if exists connection_events_event_type_check;
alter table public.connection_events add constraint connection_events_event_type_check
check (event_type in (
  'schedule_set','schedule_proposed','schedule_declined','on_the_way','arrived','in_progress',
  'location_shared','location_stopped','reminder','running_late','cannot_make_it','connection_cancelled',
  'issue_opened','issue_reviewing','issue_response','issue_resolved'
));

create or replace function public.cancel_connection_with_protection(
  p_connection_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  v_clean_note := nullif(left(btrim(coalesce(p_note,'')),1000),'');

  select * into v_connection
  from public.connections
  where id = p_connection_id
  for update;

  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;
  if v_connection.status not in ('confirmed','active') then
    raise exception 'This connection is no longer active';
  end if;

  v_other := case
    when auth.uid() = v_connection.requester_id then v_connection.responder_id
    else v_connection.requester_id
  end;

  select * into v_payment
  from public.connection_payments
  where connection_id = p_connection_id
  limit 1;
  v_has_payment := found;

  -- Do not let a cancellation race an unsettled checkout or hide a post-release money issue.
  if v_has_payment and v_payment.status in ('processing','checkout_created') then
    raise exception 'PAYMENT_STILL_PROCESSING';
  end if;
  if v_has_payment and v_payment.status in ('released','disputed') then
    raise exception 'PAYMENT_NEEDS_RESOLUTION_CENTER';
  end if;

  select id into v_existing_case_id
  from public.connection_resolution_cases
  where connection_id = p_connection_id
    and status in ('submitted','under_review')
  order by created_at desc
  limit 1;

  if v_has_payment and v_payment.status = 'secured' then
    v_review_required := true;

    if v_existing_case_id is not null then
      v_case_id := v_existing_case_id;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_type', e.event_type,
        'actor_id', e.actor_id,
        'body', e.body,
        'created_at', e.created_at
      ) order by e.created_at), '[]'::jsonb)
      into v_events
      from (
        select event_type, actor_id, body, created_at
        from public.connection_events
        where connection_id = p_connection_id
        order by created_at desc
        limit 25
      ) e;

      insert into public.connection_resolution_cases(
        connection_id,
        request_id,
        opened_by,
        against_user_id,
        reason,
        requested_resolution,
        details,
        payment_status_snapshot,
        payment_total_cents_snapshot,
        currency_snapshot,
        scheduled_start_snapshot,
        meeting_label_snapshot,
        coordination_status_snapshot,
        evidence_snapshot
      ) values (
        p_connection_id,
        v_connection.request_id,
        auth.uid(),
        null,
        'cancellation',
        'review',
        v_clean_note,
        v_payment.status,
        coalesce(v_payment.customer_total_cents, v_payment.gross_amount_cents),
        v_payment.currency,
        v_connection.scheduled_start_at,
        v_connection.meeting_label,
        v_connection.coordination_status,
        jsonb_build_object(
          'captured_at', now(),
          'connection_status', v_connection.status,
          'cancellation_actor_id', auth.uid(),
          'voluntary_cancellation', true,
          'last_coordination_actor_id', v_connection.last_coordination_actor_id,
          'last_coordination_at', v_connection.last_coordination_at,
          'events', coalesce(v_events,'[]'::jsonb)
        )
      ) returning id into v_case_id;
    end if;
  end if;

  update public.connection_schedule_proposals
  set status='superseded', responded_at=now(), updated_at=now()
  where connection_id=p_connection_id and status='pending';

  delete from public.connection_live_locations
  where connection_id=p_connection_id;

  update public.connections
  set status='cancelled',
      last_coordination_actor_id=auth.uid(),
      last_coordination_at=now(),
      updated_at=now()
  where id=p_connection_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    p_connection_id,
    auth.uid(),
    'connection_cancelled',
    case when v_review_required
      then 'Cancelled the connection. Protected payment review is required before any payout or refund.'
      else 'Cancelled the connection.'
    end,
    jsonb_build_object(
      'note', v_clean_note,
      'resolution_case_id', v_case_id,
      'protected_payment_review', v_review_required
    )
  );

  perform public.push_notification(
    v_other,
    'connection_cancelled',
    'participant-cancelled:'||p_connection_id::text||':'||auth.uid()::text,
    'Your Aspire connection was cancelled',
    case when v_review_required
      then 'The other participant cancelled. A protected payment review is open, so provider payout stays paused.'
      else 'The other participant cancelled this connection. Open Aspire to review the activity record.'
    end,
    auth.uid(),
    v_connection.request_id,
    null,
    p_connection_id,
    null
  );

  return jsonb_build_object(
    'status','cancelled',
    'resolution_case_id',v_case_id,
    'review_required',v_review_required,
    'payment_status',case when v_has_payment then v_payment.status else null end
  );
end;
$$;

revoke all on function public.cancel_connection_with_protection(uuid,text) from public, anon;
grant execute on function public.cancel_connection_with_protection(uuid,text) to authenticated;
