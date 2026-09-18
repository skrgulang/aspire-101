-- Server-only fixed-window limits for paid AI endpoints.
-- Browser roles cannot execute the limiter or access its backing table.

create table if not exists private.ai_rate_limit_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, surface, window_start)
);

alter table private.ai_rate_limit_windows enable row level security;
revoke all on table private.ai_rate_limit_windows from PUBLIC, anon, authenticated;

create or replace function public.consume_ai_rate_limit(
  p_user_id uuid,
  p_surface text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_surface text := lower(btrim(coalesce(p_surface, '')));
  v_window_start timestamptz;
  v_count integer;
begin
  if p_user_id is null then raise exception 'AI_RATE_LIMIT_USER_REQUIRED'; end if;
  if v_surface not in ('agent','pulse','connection','moderation') then raise exception 'AI_RATE_LIMIT_SURFACE'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'AI_RATE_LIMIT_CONFIG'; end if;
  if p_window_seconds is null or p_window_seconds < 60 or p_window_seconds > 86400 then raise exception 'AI_RATE_LIMIT_CONFIG'; end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.ai_rate_limit_windows(user_id,surface,window_start,request_count,updated_at)
  values(p_user_id,v_surface,v_window_start,1,now())
  on conflict(user_id,surface,window_start)
  do update set request_count=private.ai_rate_limit_windows.request_count+1, updated_at=now()
  returning request_count into v_count;

  if v_count > p_limit then
    raise exception 'AI_RATE_LIMIT';
  end if;

  delete from private.ai_rate_limit_windows
  where window_start < now() - interval '2 days';

  return v_count;
end;
$$;

revoke all on function public.consume_ai_rate_limit(uuid,text,integer,integer) from PUBLIC, anon, authenticated;
grant execute on function public.consume_ai_rate_limit(uuid,text,integer,integer) to service_role;
