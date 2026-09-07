-- Database-enforced anti-spam limits. These are intentionally generous for normal campus use.
-- They cannot be bypassed by changing the web client.

create or replace function public.guard_request_velocity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_hour integer;
  v_day integer;
  v_duplicate integer;
begin
  select count(*)::integer into v_hour from public.requests
    where poster_id=new.poster_id and created_at >= now() - interval '1 hour';
  select count(*)::integer into v_day from public.requests
    where poster_id=new.poster_id and created_at >= now() - interval '24 hours';
  select count(*)::integer into v_duplicate from public.requests
    where poster_id=new.poster_id
      and lower(regexp_replace(title,'\s+',' ','g')) = lower(regexp_replace(new.title,'\s+',' ','g'))
      and created_at >= now() - interval '15 minutes';

  if v_hour >= 8 or v_day >= 30 or v_duplicate >= 3 then
    raise exception 'POST_RATE_LIMIT';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_request_velocity() from public;
drop trigger if exists request_velocity_guard_tg on public.requests;
create trigger request_velocity_guard_tg before insert on public.requests
for each row execute function public.guard_request_velocity();

create or replace function public.guard_response_velocity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_hour integer;
begin
  select count(*)::integer into v_hour from public.request_responses
    where responder_id=new.responder_id and created_at >= now() - interval '1 hour';
  if v_hour >= 30 then raise exception 'RESPONSE_RATE_LIMIT'; end if;
  return new;
end;
$$;

revoke all on function public.guard_response_velocity() from public;
drop trigger if exists response_velocity_guard_tg on public.request_responses;
create trigger response_velocity_guard_tg before insert on public.request_responses
for each row execute function public.guard_response_velocity();

create or replace function public.guard_message_velocity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_five_min integer;
  v_duplicate integer;
begin
  select count(*)::integer into v_five_min from public.connection_messages
    where sender_id=new.sender_id and created_at >= now() - interval '5 minutes';
  select count(*)::integer into v_duplicate from public.connection_messages
    where sender_id=new.sender_id
      and lower(trim(body)) = lower(trim(new.body))
      and created_at >= now() - interval '2 minutes';
  if v_five_min >= 120 or v_duplicate >= 8 then raise exception 'MESSAGE_RATE_LIMIT'; end if;
  return new;
end;
$$;

revoke all on function public.guard_message_velocity() from public;
drop trigger if exists message_velocity_guard_tg on public.connection_messages;
create trigger message_velocity_guard_tg before insert on public.connection_messages
for each row execute function public.guard_message_velocity();
