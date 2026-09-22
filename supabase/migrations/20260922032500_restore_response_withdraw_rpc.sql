-- Restore the responder-owned withdraw flow without reopening direct table UPDATE privileges.

create or replace function public.get_my_outgoing_request_responses()
returns table(
  response_id uuid,
  request_id uuid,
  response_message text,
  response_status text,
  responded_at timestamptz,
  request_title text,
  request_category text,
  request_kind text,
  request_status text,
  moderation_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rr.id,
    rr.request_id,
    rr.message,
    rr.status,
    rr.created_at,
    case
      when r.moderation_status = 'approved' then r.title
      else 'Request unavailable'
    end,
    case
      when r.moderation_status = 'approved' then r.category
      else 'Request'
    end,
    r.kind,
    r.status,
    r.moderation_status
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where auth.uid() is not null
    and rr.responder_id = auth.uid()
  order by rr.created_at desc
  limit 200;
$$;

revoke all on function public.get_my_outgoing_request_responses() from public, anon;
grant execute on function public.get_my_outgoing_request_responses() to authenticated, service_role;

create or replace function public.withdraw_request_response(p_response_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_response public.request_responses%rowtype;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_response_id is null then
    raise exception 'RESPONSE_REQUIRED';
  end if;

  select * into v_response
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if not found or v_response.responder_id <> v_user then
    raise exception 'RESPONSE_NOT_FOUND';
  end if;

  if v_response.status = 'withdrawn' then
    return 'withdrawn';
  end if;

  if v_response.status <> 'pending' then
    raise exception 'RESPONSE_NOT_WITHDRAWABLE';
  end if;

  update public.request_responses
  set status = 'withdrawn'
  where id = p_response_id;

  return 'withdrawn';
end;
$$;

revoke all on function public.withdraw_request_response(uuid) from public, anon;
grant execute on function public.withdraw_request_response(uuid) to authenticated, service_role;
