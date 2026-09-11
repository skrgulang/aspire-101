-- Resolution Center follow-up: fair two-sided case participation and useful attendance signals.
-- These records help Trust & Safety review no-show/cancellation disputes without requiring location sharing.

alter table public.connection_events drop constraint if exists connection_events_event_type_check;
alter table public.connection_events add constraint connection_events_event_type_check
check (event_type in (
  'schedule_set','on_the_way','arrived','in_progress','location_shared','location_stopped','reminder',
  'running_late','cannot_make_it','issue_opened','issue_reviewing','issue_response','issue_resolved'
));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind in (
  'request_response','connection_chosen','connection_confirmed','connection_completed','connection_cancelled',
  'message','circle_mutual','connection_reminder','connection_coordination','resolution_case'
));

create table if not exists public.connection_resolution_responses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.connection_resolution_cases(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists connection_resolution_responses_case_idx
on public.connection_resolution_responses(case_id, created_at asc);

alter table public.connection_resolution_responses enable row level security;
revoke all on table public.connection_resolution_responses from public, anon;
grant select on public.connection_resolution_responses to authenticated;

drop policy if exists "participants or moderators read resolution responses" on public.connection_resolution_responses;
create policy "participants or moderators read resolution responses"
on public.connection_resolution_responses for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_resolution_responses.connection_id
      and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
  )
  or exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('moderator','admin')
  )
);

create or replace function public.record_connection_attendance_update(
  p_connection_id uuid,
  p_update text
)
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

  select * into v_connection from public.connections where id = p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not active'; end if;

  v_other := case when auth.uid() = v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;
  v_body := case p_update
    when 'running_late' then 'Running late. Please check chat for coordination.'
    else 'Can’t make the agreed time. Please coordinate next steps in chat.'
  end;

  update public.connections set
    last_coordination_actor_id = auth.uid(),
    last_coordination_at = now(),
    updated_at = now()
  where id = p_connection_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body)
  values (p_connection_id,auth.uid(),p_update,v_body)
  returning id into v_event_id;

  perform public.push_notification(
    v_other,
    'connection_coordination',
    'attendance:'||v_event_id::text,
    case when p_update='running_late' then 'Your Aspire connection is running late' else 'Your Aspire connection can’t make the agreed time' end,
    v_body,
    auth.uid(),
    v_connection.request_id,
    null,
    p_connection_id,
    null
  );
end;
$$;
revoke all on function public.record_connection_attendance_update(uuid,text) from public, anon;
grant execute on function public.record_connection_attendance_update(uuid,text) to authenticated;

create or replace function public.add_connection_resolution_response(
  p_case_id uuid,
  p_body text
)
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

  select count(*) into v_count
  from public.connection_resolution_responses
  where case_id = p_case_id and author_id = auth.uid();
  if v_count >= 10 then raise exception 'Too many updates for this case. Wait for Aspire review.'; end if;

  insert into public.connection_resolution_responses(case_id,connection_id,author_id,body)
  values (p_case_id,v_case.connection_id,auth.uid(),v_clean)
  returning id into v_response_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    v_case.connection_id,
    auth.uid(),
    'issue_response',
    'Added information to the Resolution Center case.',
    jsonb_build_object('case_id',p_case_id,'response_id',v_response_id)
  );

  perform public.push_notification(
    v_other,
    'resolution_case',
    'resolution-response:'||v_response_id::text,
    'New update on your Resolution Center case',
    'The other participant added information. Review the case from your active connection.',
    auth.uid(),
    v_case.request_id,
    null,
    v_case.connection_id,
    null
  );

  return v_response_id;
end;
$$;
revoke all on function public.add_connection_resolution_response(uuid,text) from public, anon;
grant execute on function public.add_connection_resolution_response(uuid,text) to authenticated;

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
  select * into v_connection from public.connections where id = new.connection_id;
  if not found then return new; end if;
  v_other := case when new.opened_by = v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;
  perform public.push_notification(
    v_other,
    'resolution_case',
    'resolution-opened:'||new.id::text,
    'A Resolution Center case was opened',
    'Provider payout is paused while the issue is open. You can add your side from the active connection.',
    new.opened_by,
    new.request_id,
    null,
    new.connection_id,
    null
  );
  return new;
end;
$$;
revoke all on function public.notify_resolution_case_insert() from public, anon;
drop trigger if exists notify_resolution_case_after_insert on public.connection_resolution_cases;
create trigger notify_resolution_case_after_insert
after insert on public.connection_resolution_cases
for each row execute function public.notify_resolution_case_insert();

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
  select * into v_connection from public.connections where id = new.connection_id;
  if not found then return new; end if;

  v_title := case new.status
    when 'under_review' then 'Aspire is reviewing your case'
    when 'resolved_refund' then 'Your Resolution Center case was refunded'
    when 'resolved_release' then 'Your Resolution Center case was resolved'
    when 'resolved_partial' then 'Your Resolution Center case was partially resolved'
    when 'dismissed' then 'Your Resolution Center case was closed'
    else 'Resolution Center case updated'
  end;
  v_body := case new.status
    when 'under_review' then 'Payment release remains paused while Aspire reviews the issue.'
    when 'resolved_refund' then 'Aspire approved a refund. Bank timing may vary after Stripe processes it.'
    when 'dismissed' then 'Aspire closed the case. Any otherwise-eligible payout is no longer blocked by this case.'
    else 'Open the connection to review the latest case status.'
  end;

  perform public.push_notification(v_connection.requester_id,'resolution_case','resolution-status:'||new.id::text||':'||new.status,v_title,v_body,new.reviewed_by,new.request_id,null,new.connection_id,null);
  perform public.push_notification(v_connection.responder_id,'resolution_case','resolution-status:'||new.id::text||':'||new.status,v_title,v_body,new.reviewed_by,new.request_id,null,new.connection_id,null);
  return new;
end;
$$;
revoke all on function public.notify_resolution_case_status_change() from public, anon;
drop trigger if exists notify_resolution_case_after_update on public.connection_resolution_cases;
create trigger notify_resolution_case_after_update
after update of status on public.connection_resolution_cases
for each row execute function public.notify_resolution_case_status_change();
