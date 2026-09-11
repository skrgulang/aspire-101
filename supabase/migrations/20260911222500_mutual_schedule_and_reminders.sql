-- Mutual scheduling + reminder support for Aspire Live.
-- Production-safe: preserves the Resolution Center/cancellation event and notification types
-- already in production instead of replaying older integration-branch constraints.

alter table public.connection_events
  drop constraint if exists connection_events_event_type_check;
alter table public.connection_events
  add constraint connection_events_event_type_check
  check (event_type in (
    'schedule_set',
    'schedule_proposed',
    'schedule_declined',
    'on_the_way',
    'arrived',
    'in_progress',
    'location_shared',
    'location_stopped',
    'reminder',
    'running_late',
    'cannot_make_it',
    'connection_cancelled',
    'issue_opened',
    'issue_reviewing',
    'issue_response',
    'issue_resolved'
  ));

-- Notifications already have event_key + UNIQUE(user_id,event_key) in production.
-- Connection events need their own idempotency key so Vercel Cron retries cannot duplicate reminders.
alter table public.connection_events
  add column if not exists event_key text;

alter table public.connection_events
  drop constraint if exists connection_events_event_key_length_check;
alter table public.connection_events
  add constraint connection_events_event_key_length_check
  check (event_key is null or char_length(event_key) <= 220);

create unique index if not exists connection_events_event_key_unique_idx
  on public.connection_events(event_key);

create table if not exists public.connection_schedule_proposals (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz null,
  timezone text null check (timezone is null or char_length(timezone) <= 100),
  meeting_label text null check (meeting_label is null or char_length(meeting_label) <= 240),
  status text not null default 'pending' check (status in ('pending','accepted','declined','superseded')),
  responded_by uuid null references auth.users(id) on delete set null,
  responded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);

create unique index if not exists connection_schedule_one_pending_idx
  on public.connection_schedule_proposals(connection_id)
  where status = 'pending';
create index if not exists connection_schedule_proposals_connection_idx
  on public.connection_schedule_proposals(connection_id, created_at desc);
create index if not exists connection_schedule_proposals_proposed_by_idx
  on public.connection_schedule_proposals(proposed_by, created_at desc);
create index if not exists connection_schedule_proposals_responded_by_idx
  on public.connection_schedule_proposals(responded_by)
  where responded_by is not null;

alter table public.connection_schedule_proposals enable row level security;
revoke all on table public.connection_schedule_proposals from public, anon, authenticated;
grant select on public.connection_schedule_proposals to authenticated;

drop policy if exists "participants read schedule proposals" on public.connection_schedule_proposals;
create policy "participants read schedule proposals"
on public.connection_schedule_proposals
for select
to authenticated
using (
  exists (
    select 1
    from public.connections c
    where c.id = connection_schedule_proposals.connection_id
      and (select auth.uid()) in (c.requester_id, c.responder_id)
  )
);

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
  if p_end_at is not null and p_end_at <= p_start_at then raise exception 'End time must be after start time'; end if;

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

revoke all on function public.propose_connection_schedule(uuid,timestamptz,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.propose_connection_schedule(uuid,timestamptz,text,text,timestamptz) to authenticated;

create or replace function public.respond_connection_schedule(
  p_proposal_id uuid,
  p_accept boolean
)
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

revoke all on function public.respond_connection_schedule(uuid,boolean) from public, anon, authenticated;
grant execute on function public.respond_connection_schedule(uuid,boolean) to authenticated;

-- Close the legacy one-sided scheduling path once mutual proposals exist.
revoke all on function public.set_connection_schedule(uuid,timestamptz,text,text,timestamptz) from public, anon, authenticated;

-- Prevent stale pending proposals from surviving a completed/cancelled connection.
create or replace function public.supersede_schedule_proposals_on_connection_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and new.status in ('completed','cancelled') then
    update public.connection_schedule_proposals
    set status = 'superseded', responded_at = now(), updated_at = now()
    where connection_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function public.supersede_schedule_proposals_on_connection_close() from public, anon, authenticated;

drop trigger if exists supersede_schedule_proposals_on_connection_close on public.connections;
create trigger supersede_schedule_proposals_on_connection_close
after update of status on public.connections
for each row
execute function public.supersede_schedule_proposals_on_connection_close();
