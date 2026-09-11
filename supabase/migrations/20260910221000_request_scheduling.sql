-- Structured scheduling for Aspire requests.
-- Exact coordinates are intentionally not stored here; posters may provide an approximate
-- meeting label and can share precise/live location only after a mutual connection.

alter table public.requests
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists timezone text,
  add column if not exists meeting_label text;

alter table public.requests
  drop constraint if exists requests_schedule_end_after_start_check;
alter table public.requests
  add constraint requests_schedule_end_after_start_check
  check (
    scheduled_end_at is null
    or (scheduled_start_at is not null and scheduled_end_at > scheduled_start_at)
  );

alter table public.requests
  drop constraint if exists requests_meeting_label_length_check;
alter table public.requests
  add constraint requests_meeting_label_length_check
  check (meeting_label is null or char_length(meeting_label) <= 240);

alter table public.requests
  drop constraint if exists requests_timezone_length_check;
alter table public.requests
  add constraint requests_timezone_length_check
  check (timezone is null or char_length(timezone) <= 100);

-- Seed the post's agreed starting point into a new connection. Either participant can
-- still change it later through set_connection_schedule(), which also records an event.
create or replace function public.seed_connection_schedule_from_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_request public.requests;
begin
  select * into v_request from public.requests where id = new.request_id;
  if not found then return new; end if;

  new.scheduled_start_at := coalesce(new.scheduled_start_at, v_request.scheduled_start_at);
  new.scheduled_end_at := coalesce(new.scheduled_end_at, v_request.scheduled_end_at);
  new.timezone := coalesce(new.timezone, v_request.timezone);
  new.meeting_label := coalesce(new.meeting_label, v_request.meeting_label);

  if new.scheduled_start_at is not null and coalesce(new.coordination_status, 'planning') = 'planning' then
    new.coordination_status := 'scheduled';
  end if;

  return new;
end;
$$;

revoke all on function public.seed_connection_schedule_from_request() from public;

drop trigger if exists seed_connection_schedule_from_request_trigger on public.connections;
create trigger seed_connection_schedule_from_request_trigger
before insert or update of request_id on public.connections
for each row execute function public.seed_connection_schedule_from_request();
