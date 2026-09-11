-- Aspire Resolution Center
-- Participant-created cases pause protected payout release while preserving a clear
-- audit trail for no-shows, cancellations, incomplete work, payment issues and safety.
-- Financial resolution remains server/admin controlled.

create table if not exists public.connection_resolution_cases (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  opened_by uuid not null references auth.users(id) on delete cascade,
  against_user_id uuid null references auth.users(id) on delete set null,
  reason text not null check (reason in ('no_show','cancellation','incomplete','not_as_described','payment','safety','other')),
  requested_resolution text not null default 'review' check (requested_resolution in ('refund','provider_compensation','partial','review','safety_review')),
  details text null check (details is null or char_length(details) <= 2000),
  status text not null default 'submitted' check (status in ('submitted','under_review','resolved_refund','resolved_release','resolved_partial','dismissed')),
  payment_status_snapshot text null,
  payment_total_cents_snapshot integer null check (payment_total_cents_snapshot is null or payment_total_cents_snapshot >= 0),
  currency_snapshot text null,
  scheduled_start_snapshot timestamptz null,
  meeting_label_snapshot text null,
  coordination_status_snapshot text null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  resolution_note text null check (resolution_note is null or char_length(resolution_note) <= 2000),
  refund_cents integer null check (refund_cents is null or refund_cents >= 0),
  provider_release_cents integer null check (provider_release_cents is null or provider_release_cents >= 0),
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists connection_resolution_one_open_case_idx
on public.connection_resolution_cases(connection_id)
where status in ('submitted','under_review');

create index if not exists connection_resolution_cases_status_idx
on public.connection_resolution_cases(status, created_at desc);

create index if not exists connection_resolution_cases_opened_by_idx
on public.connection_resolution_cases(opened_by, created_at desc);

create table if not exists public.connection_no_show_incidents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.connection_resolution_cases(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  note text null check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists connection_no_show_user_idx
on public.connection_no_show_incidents(user_id, created_at desc);

-- Expand the private connection timeline so disputes appear in chat/activity without
-- leaking the claim text or financial evidence into the timeline itself.
alter table public.connection_events drop constraint if exists connection_events_event_type_check;
alter table public.connection_events add constraint connection_events_event_type_check
check (event_type in (
  'schedule_set','on_the_way','arrived','in_progress','location_shared','location_stopped','reminder',
  'issue_opened','issue_reviewing','issue_resolved'
));

alter table public.connection_resolution_cases enable row level security;
alter table public.connection_no_show_incidents enable row level security;

revoke all on table public.connection_resolution_cases from public, anon;
revoke all on table public.connection_no_show_incidents from public, anon;
grant select on public.connection_resolution_cases to authenticated;
grant select on public.connection_no_show_incidents to authenticated;

-- Participants can see cases for their own connection. Trust & Safety can see all cases.
drop policy if exists "participants or moderators read resolution cases" on public.connection_resolution_cases;
create policy "participants or moderators read resolution cases"
on public.connection_resolution_cases for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_resolution_cases.connection_id
      and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
  )
  or exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('moderator','admin')
  )
);

-- Confirmed no-show strikes are internal Trust & Safety data.
drop policy if exists "moderators read no show incidents" on public.connection_no_show_incidents;
create policy "moderators read no show incidents"
on public.connection_no_show_incidents for select to authenticated using (
  exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('moderator','admin')
  )
);

create or replace function public.open_connection_resolution_case(
  p_connection_id uuid,
  p_reason text,
  p_details text default null,
  p_requested_resolution text default 'review',
  p_against_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
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

  select * into v_connection from public.connections where id = p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active','completed') then raise exception 'This connection is not eligible for a resolution case'; end if;

  v_against := coalesce(
    p_against_user_id,
    case when auth.uid() = v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end
  );
  if v_against = auth.uid() then raise exception 'You cannot file a case against yourself'; end if;
  if v_against <> v_connection.requester_id and v_against <> v_connection.responder_id then raise exception 'The reported account is not part of this connection'; end if;

  if p_reason = 'no_show' then
    if v_connection.scheduled_start_at is null then raise exception 'Set an agreed meeting time before reporting a no-show'; end if;
    if now() < v_connection.scheduled_start_at + interval '10 minutes' then
      raise exception 'NO_SHOW_GRACE_PERIOD';
    end if;
  end if;

  if exists (
    select 1 from public.connection_resolution_cases
    where connection_id = p_connection_id and status in ('submitted','under_review')
  ) then raise exception 'An issue is already open for this connection'; end if;

  select
    cp.status,
    coalesce(cp.customer_total_cents, cp.gross_amount_cents),
    cp.currency
  into v_payment_status, v_payment_total, v_currency
  from public.connection_payments cp
  where cp.connection_id = p_connection_id
  limit 1;

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
    v_against,
    p_reason,
    p_requested_resolution,
    nullif(left(btrim(coalesce(p_details,'')),2000),''),
    v_payment_status,
    v_payment_total,
    v_currency,
    v_connection.scheduled_start_at,
    v_connection.meeting_label,
    v_connection.coordination_status,
    jsonb_build_object(
      'captured_at', now(),
      'connection_status', v_connection.status,
      'last_coordination_actor_id', v_connection.last_coordination_actor_id,
      'last_coordination_at', v_connection.last_coordination_at,
      'events', coalesce(v_events,'[]'::jsonb)
    )
  ) returning id into v_case_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    p_connection_id,
    auth.uid(),
    'issue_opened',
    'An Aspire Resolution Center case was opened. Payment release is paused while the issue is open.',
    jsonb_build_object('case_id',v_case_id,'reason',p_reason)
  );

  return v_case_id;
end;
$$;

revoke all on function public.open_connection_resolution_case(uuid,text,text,text,uuid) from public, anon;
grant execute on function public.open_connection_resolution_case(uuid,text,text,text,uuid) to authenticated;

-- Moderators may triage or dismiss. Financial actions are deliberately not exposed here;
-- refunds/releases are performed by an authenticated server route with an explicit admin check.
create or replace function public.review_connection_resolution_case(
  p_case_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case public.connection_resolution_cases;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.user_roles where user_id = auth.uid();
  if coalesce(v_role,'member') not in ('moderator','admin') then raise exception 'Moderator access required'; end if;
  if p_status not in ('under_review','dismissed') then raise exception 'Invalid review action'; end if;

  select * into v_case from public.connection_resolution_cases where id = p_case_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_case.status not in ('submitted','under_review') then raise exception 'Case is already resolved'; end if;

  update public.connection_resolution_cases set
    status = p_status,
    resolution_note = nullif(left(btrim(coalesce(p_note,'')),2000),''),
    reviewed_by = auth.uid(),
    reviewed_at = case when p_status = 'dismissed' then now() else reviewed_at end,
    updated_at = now()
  where id = p_case_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    v_case.connection_id,
    auth.uid(),
    case when p_status = 'under_review' then 'issue_reviewing' else 'issue_resolved' end,
    case when p_status = 'under_review' then 'Aspire is reviewing the reported issue. Payment release remains paused.' else 'Aspire reviewed the issue and closed the case.' end,
    jsonb_build_object('case_id',p_case_id,'status',p_status)
  );
end;
$$;

revoke all on function public.review_connection_resolution_case(uuid,text,text) from public, anon;
grant execute on function public.review_connection_resolution_case(uuid,text,text) to authenticated;
