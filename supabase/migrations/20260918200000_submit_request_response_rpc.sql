-- Restore the Request Response flow through a validated RPC.
-- Direct authenticated INSERT/UPDATE grants are intentionally absent.

create or replace function public.submit_request_response(
  p_request_id uuid,
  p_message text default null
)
returns table(
  id uuid,
  request_id uuid,
  responder_id uuid,
  message text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_request public.requests%rowtype;
  v_existing public.request_responses%rowtype;
  v_state text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_request_id is null then
    raise exception 'REQUEST_REQUIRED';
  end if;

  if v_message is not null and char_length(v_message) > 2000 then
    raise exception 'RESPONSE_MESSAGE_TOO_LONG';
  end if;

  v_state := public.effective_user_enforcement(v_user);
  if v_state in ('restricted','suspended') then
    raise exception 'ACCOUNT_RESTRICTED';
  end if;

  select * into v_request
  from public.requests r
  where r.id = p_request_id;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.poster_id = v_user then
    raise exception 'CANNOT_RESPOND_TO_OWN_REQUEST';
  end if;
  if v_request.status <> 'open' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_user and ub.blocked_id = v_request.poster_id)
       or (ub.blocker_id = v_request.poster_id and ub.blocked_id = v_user)
  ) then
    raise exception 'REQUEST_UNAVAILABLE';
  end if;

  select * into v_existing
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.responder_id = v_user
  for update;

  if found then
    if v_existing.status = 'withdrawn' then
      update public.request_responses rr
      set status = 'pending',
          message = v_message
      where rr.id = v_existing.id
      returning rr.* into v_existing;
    end if;

    return query
    select v_existing.id, v_existing.request_id, v_existing.responder_id,
           v_existing.message, v_existing.status, v_existing.created_at;
    return;
  end if;

  insert into public.request_responses(request_id, responder_id, message, status)
  values(p_request_id, v_user, v_message, 'pending')
  returning * into v_existing;

  return query
  select v_existing.id, v_existing.request_id, v_existing.responder_id,
         v_existing.message, v_existing.status, v_existing.created_at;
end;
$$;

revoke all on function public.submit_request_response(uuid,text) from public, anon;
grant execute on function public.submit_request_response(uuid,text) to authenticated, service_role;
