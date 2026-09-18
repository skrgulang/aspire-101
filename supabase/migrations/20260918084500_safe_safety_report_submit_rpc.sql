-- Route safety reports through a validated, rate-limited RPC before retiring direct table INSERT.

create or replace function public.submit_safety_report(
  p_reason text,
  p_details text default null,
  p_target_user_id uuid default null,
  p_request_id uuid default null,
  p_connection_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_request_poster uuid;
  v_connection public.connections%rowtype;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_reason not in ('spam','harassment','scam','unsafe','illegal','hate','sexual','other') then
    raise exception 'INVALID_SAFETY_REASON';
  end if;

  if v_details is not null and char_length(v_details) > 5000 then
    raise exception 'SAFETY_DETAILS_TOO_LONG';
  end if;

  if p_target_user_id = v_user then
    raise exception 'CANNOT_REPORT_SELF';
  end if;

  if p_request_id is null and p_connection_id is null and p_target_user_id is null then
    raise exception 'SAFETY_CONTEXT_REQUIRED';
  end if;

  if p_request_id is not null then
    select r.poster_id into v_request_poster
    from public.requests r
    where r.id = p_request_id;
    if not found then
      raise exception 'REQUEST_NOT_FOUND';
    end if;
    if p_target_user_id is not null and p_target_user_id <> v_request_poster then
      raise exception 'SAFETY_TARGET_MISMATCH';
    end if;
  end if;

  if p_connection_id is not null then
    select * into v_connection
    from public.connections c
    where c.id = p_connection_id;
    if not found then
      raise exception 'CONNECTION_NOT_FOUND';
    end if;
    if v_user <> v_connection.requester_id and v_user <> v_connection.responder_id then
      raise exception 'NOT_CONNECTION_PARTICIPANT';
    end if;
    if p_target_user_id is not null
       and p_target_user_id <> v_connection.requester_id
       and p_target_user_id <> v_connection.responder_id then
      raise exception 'SAFETY_TARGET_MISMATCH';
    end if;
  end if;

  if (
    select count(*) >= 10
    from public.safety_reports s
    where s.reporter_id = v_user
      and s.created_at > now() - interval '10 minutes'
  ) or (
    select count(*) >= 50
    from public.safety_reports s
    where s.reporter_id = v_user
      and s.created_at > now() - interval '24 hours'
  ) then
    raise exception 'SAFETY_REPORT_RATE_LIMIT';
  end if;

  insert into public.safety_reports(
    reporter_id, target_user_id, request_id, connection_id, reason, details
  )
  values(
    v_user, p_target_user_id, p_request_id, p_connection_id, v_reason, v_details
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_safety_report(text,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.submit_safety_report(text,text,uuid,uuid,uuid) to authenticated, service_role;
