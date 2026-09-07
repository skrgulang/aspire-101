-- Aspire Agent outcome feedback: connect plans to real requests and completed connections.
-- This records outcome state for product learning; it does not train or auto-enforce on users.

alter table public.aspire_ai_sessions
  add column if not exists created_request_id uuid references public.requests(id) on delete set null;

create index if not exists aspire_ai_sessions_created_request_idx
  on public.aspire_ai_sessions(created_request_id)
  where created_request_id is not null;

-- Limit authenticated writes to the two user-owned progression fields.
revoke update on table public.aspire_ai_sessions from authenticated;
grant update(outcome, created_request_id) on table public.aspire_ai_sessions to authenticated;

create or replace function public.link_request_to_recent_aspire_agent_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  select s.id into v_session_id
  from public.aspire_ai_sessions s
  where s.user_id = new.poster_id
    and s.created_request_id is null
    and s.created_at >= now() - interval '2 hours'
    and s.outcome in ('planned','drafted_post','posted')
    and coalesce(s.category, '') = coalesce(new.category, '')
    and coalesce(s.kind, '') = coalesce(new.kind, '')
    and lower(btrim(coalesce(s.draft->>'title',''))) = lower(btrim(coalesce(new.title,'')))
  order by s.created_at desc
  limit 1;

  if v_session_id is not null then
    update public.aspire_ai_sessions
      set created_request_id = new.id,
          outcome = 'posted'
    where id = v_session_id;
  end if;
  return new;
end;
$$;

revoke all on function public.link_request_to_recent_aspire_agent_session() from public, anon, authenticated;
grant execute on function public.link_request_to_recent_aspire_agent_session() to service_role;

drop trigger if exists link_request_to_aspire_agent_tg on public.requests;
create trigger link_request_to_aspire_agent_tg
after insert on public.requests
for each row execute function public.link_request_to_recent_aspire_agent_session();

create or replace function public.track_aspire_agent_connection_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outcome text;
begin
  if new.status = 'completed' then
    v_outcome := 'completed';
  elsif new.status in ('confirmed','active') then
    v_outcome := 'connected';
  else
    return new;
  end if;

  update public.aspire_ai_sessions s
    set outcome = v_outcome
  where s.user_id in (new.requester_id, new.responder_id)
    and (
      s.created_request_id = new.request_id
      or new.request_id = any(s.match_ids)
    )
    and s.outcome not in ('completed','dismissed');

  return new;
end;
$$;

revoke all on function public.track_aspire_agent_connection_outcome() from public, anon, authenticated;
grant execute on function public.track_aspire_agent_connection_outcome() to service_role;

drop trigger if exists track_aspire_agent_connection_outcome_tg on public.connections;
create trigger track_aspire_agent_connection_outcome_tg
after insert or update of status on public.connections
for each row execute function public.track_aspire_agent_connection_outcome();
