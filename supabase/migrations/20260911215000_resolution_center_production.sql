-- Production Resolution Center for Aspire 101.
-- Adds participant claims, two-sided case responses, payout holds, no-show audit records,
-- and cancellation protection while preserving the existing production cancel_connection(uuid) contract.

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
create index if not exists connection_resolution_cases_status_idx on public.connection_resolution_cases(status, created_at desc);
create index if not exists connection_resolution_cases_opened_by_idx on public.connection_resolution_cases(opened_by, created_at desc);

create table if not exists public.connection_resolution_responses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.connection_resolution_cases(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists connection_resolution_responses_case_idx on public.connection_resolution_responses(case_id, created_at asc);

create table if not exists public.connection_no_show_incidents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.connection_resolution_cases(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  note text null check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists connection_no_show_user_idx on public.connection_no_show_incidents(user_id, created_at desc);

alter table public.connection_events drop constraint if exists connection_events_event_type_check;
alter table public.connection_events add constraint connection_events_event_type_check
check (event_type in (
  'schedule_set','on_the_way','arrived','in_progress','location_shared','location_stopped','reminder',
  'running_late','cannot_make_it','connection_cancelled','issue_opened','issue_reviewing','issue_response','issue_resolved'
));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind in (
  'request_response','connection_chosen','connection_confirmed','connection_completed','connection_cancelled',
  'message','circle_mutual','connection_reminder','connection_coordination','resolution_case'
));

alter table public.connection_resolution_cases enable row level security;
alter table public.connection_resolution_responses enable row level security;
alter table public.connection_no_show_incidents enable row level security;

revoke all on table public.connection_resolution_cases from public, anon;
revoke all on table public.connection_resolution_responses from public, anon;
revoke all on table public.connection_no_show_incidents from public, anon;
grant select on public.connection_resolution_cases to authenticated;
grant select on public.connection_resolution_responses to authenticated;
grant select on public.connection_no_show_incidents to authenticated;

drop policy if exists "participants or moderators read resolution cases" on public.connection_resolution_cases;
create policy "participants or moderators read resolution cases"
on public.connection_resolution_cases for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_resolution_cases.connection_id
      and auth.uid() in (c.requester_id, c.responder_id)
  )
  or exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('moderator','admin')
  )
);

drop policy if exists "participants or moderators read resolution responses" on public.connection_resolution_responses;
create policy "participants or moderators read resolution responses"
on public.connection_resolution_responses for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_resolution_responses.connection_id
      and auth.uid() in (c.requester_id, c.responder_id)
  )
  or exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('moderator','admin')
  )
);

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
  if v_connection.status not in ('confirmed','active','completed','cancelled') then raise exception 'This connection is not eligible for a resolution case'; end if;

  v_against := coalesce(
    p_against_user_id,
    case when auth.uid() = v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end
  );
  if v_against = auth.uid() then raise exception 'You cannot file a case against yourself'; end if;
  if v_against <> v_connection.requester_id and v_against <> v_connection.responder_id then raise exception 'The reported account is not part of this connection'; end if;

  if p_reason = 'no_show' then
    if v_connection.scheduled_start_at is null then raise exception 'Set an agreed meeting time before reporting a no-show'; end if;
    if now() < v_connection.scheduled_start_at + interval '10 minutes' then raise exception 'NO_SHOW_GRACE_PERIOD'; end if;
  end if;

  if exists (
    select 1 from public.connection_resolution_cases
    where connection_id = p_connection_id and status in ('submitted','under_review')
  ) then raise exception 'An issue is already open for this connection'; end if;

  select cp.status, coalesce(cp.customer_total_cents, cp.gross_amount_cents), cp.currency
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
    connection_id, request_id, opened_by, against_user_id, reason, requested_resolution, details,
    payment_status_snapshot, payment_total_cents_snapshot, currency_snapshot,
    scheduled_start_snapshot, meeting_label_snapshot, coordination_status_snapshot, evidence_snapshot
  ) values (
    p_connection_id, v_connection.request_id, auth.uid(), v_against, p_reason, p_requested_resolution,
    nullif(left(btrim(coalesce(p_details,'')),2000),''),
    v_payment_status, v_payment_total, v_currency,
    v_connection.scheduled_start_at, v_connection.meeting_label, v_connection.coordination_status,
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
    p_connection_id, auth.uid(), 'issue_opened',
    'An Aspire Resolution Center case was opened. Payment release is paused while the issue is open.',
    jsonb_build_object('case_id',v_case_id,'reason',p_reason)
  );

  return v_case_id;
end;
$$;
revoke all on function public.open_connection_resolution_case(uuid,text,text,text,uuid) from public, anon;
grant execute on function public.open_connection_resolution_case(uuid,text,text,text,uuid) to authenticated;

create or replace function public.add_connection_resolution_response(p_case_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
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

  select * into v_case from public.connection_resolution_cases where id = p_case_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_case.status not in ('submitted','under_review') then raise exception 'This case is already closed'; end if;

  select * into v_connection from public.connections where id = v_case.connection_id;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  v_other := case when auth.uid() = v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;

  select count(*) into v_count from public.connection_resolution_responses where case_id = p_case_id and author_id = auth.uid();
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
$$;
revoke all on function public.add_connection_resolution_response(uuid,text) from public, anon;
grant execute on function public.add_connection_resolution_response(uuid,text) to authenticated;

create or replace function public.review_connection_resolution_case(p_case_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case public.connection_resolution_cases;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.user_roles where user_id=auth.uid() and role in ('moderator','admin')) then
    raise exception 'Moderator access required';
  end if;
  if p_status not in ('under_review','dismissed') then raise exception 'Invalid review action'; end if;

  select * into v_case from public.connection_resolution_cases where id = p_case_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_case.status not in ('submitted','under_review') then raise exception 'Case is already resolved'; end if;

  update public.connection_resolution_cases set
    status=p_status,
    resolution_note=nullif(left(btrim(coalesce(p_note,'')),2000),''),
    reviewed_by=auth.uid(),
    reviewed_at=case when p_status='dismissed' then now() else reviewed_at end,
    updated_at=now()
  where id=p_case_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    v_case.connection_id,auth.uid(),
    case when p_status='under_review' then 'issue_reviewing' else 'issue_resolved' end,
    case when p_status='under_review' then 'Aspire is reviewing the reported issue. Payment release remains paused.' else 'Aspire reviewed the issue and closed the case.' end,
    jsonb_build_object('case_id',p_case_id,'status',p_status)
  );
end;
$$;
revoke all on function public.review_connection_resolution_case(uuid,text,text) from public, anon;
grant execute on function public.review_connection_resolution_case(uuid,text,text) to authenticated;

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
revoke all on function public.record_connection_attendance_update(uuid,text) from public, anon;
grant execute on function public.record_connection_attendance_update(uuid,text) to authenticated;

create or replace function public.notify_resolution_case_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.connections;
  v_other uuid;
begin
  -- Voluntary self-cancellation cases are announced by the cancellation RPC itself.
  if new.reason='cancellation' and new.against_user_id is null then return new; end if;
  select * into v_connection from public.connections where id=new.connection_id;
  if not found then return new; end if;
  v_other := case when new.opened_by=v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;
  perform public.push_notification(
    v_other,'resolution_case','resolution-opened:'||new.id::text,
    'A Resolution Center case was opened',
    'Provider payout is paused while the issue is open. You can add your side from Resolution Center.',
    new.opened_by,new.request_id,null,new.connection_id,null
  );
  return new;
end;
$$;
revoke all on function public.notify_resolution_case_insert() from public, anon;
drop trigger if exists notify_resolution_case_after_insert on public.connection_resolution_cases;
create trigger notify_resolution_case_after_insert after insert on public.connection_resolution_cases for each row execute function public.notify_resolution_case_insert();

create or replace function public.notify_resolution_case_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.connections;
  v_title text;
  v_body text;
begin
  if old.status is not distinct from new.status then return new; end if;
  select * into v_connection from public.connections where id=new.connection_id;
  if not found then return new; end if;
  v_title := case new.status
    when 'under_review' then 'Aspire is reviewing your case'
    when 'resolved_refund' then 'Your Resolution Center case was refunded'
    when 'resolved_release' then 'Your Resolution Center case was resolved'
    when 'resolved_partial' then 'Your Resolution Center case was partially resolved'
    when 'dismissed' then 'Your Resolution Center case was closed'
    else 'Resolution Center case updated' end;
  v_body := case new.status
    when 'under_review' then 'Payment release remains paused while Aspire reviews the issue.'
    when 'resolved_refund' then 'Aspire approved a refund. Bank timing may vary after Stripe processes it.'
    when 'dismissed' then 'Aspire closed the case. Any otherwise-eligible payout is no longer blocked by this case.'
    else 'Open Resolution Center to review the latest case status.' end;
  perform public.push_notification(v_connection.requester_id,'resolution_case','resolution-status:'||new.id::text||':'||new.status,v_title,v_body,new.reviewed_by,new.request_id,null,new.connection_id,null);
  perform public.push_notification(v_connection.responder_id,'resolution_case','resolution-status:'||new.id::text||':'||new.status,v_title,v_body,new.reviewed_by,new.request_id,null,new.connection_id,null);
  return new;
end;
$$;
revoke all on function public.notify_resolution_case_status_change() from public, anon;
drop trigger if exists notify_resolution_case_after_update on public.connection_resolution_cases;
create trigger notify_resolution_case_after_update after update of status on public.connection_resolution_cases for each row execute function public.notify_resolution_case_status_change();

create or replace function public.cancel_connection_with_protection(p_connection_id uuid, p_note text default null)
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
  select * into v_connection from public.connections where id=p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
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
        jsonb_build_object(
          'captured_at',now(),'connection_status',v_connection.status,
          'cancellation_actor_id',auth.uid(),'voluntary_cancellation',true,
          'last_coordination_actor_id',v_connection.last_coordination_actor_id,
          'last_coordination_at',v_connection.last_coordination_at,
          'events',coalesce(v_events,'[]'::jsonb)
        )
      ) returning id into v_case_id;
    end if;
  end if;

  insert into public.connection_cancellations(connection_id,cancelled_by,note,payment_status_snapshot)
  values (p_connection_id,auth.uid(),v_clean_note,case when v_has_payment then v_payment.status else null end)
  on conflict (connection_id) do update set note=coalesce(excluded.note,public.connection_cancellations.note), payment_status_snapshot=excluded.payment_status_snapshot;

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
$$;
revoke all on function public.cancel_connection_with_protection(uuid,text) from public, anon;
grant execute on function public.cancel_connection_with_protection(uuid,text) to authenticated;

-- Keep every existing client safe: the legacy RPC now delegates to the protected flow.
create or replace function public.cancel_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.cancel_connection_with_protection(p_connection_id, null);
end;
$$;
revoke all on function public.cancel_connection(uuid) from public, anon;
grant execute on function public.cancel_connection(uuid) to authenticated;
