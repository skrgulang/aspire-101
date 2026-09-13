create or replace function public.accept_request_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_response public.request_responses;
  v_request public.requests;
  v_connection_id uuid;
begin
  select * into v_response
  from public.request_responses
  where id = p_response_id
  for update;
  if not found then raise exception 'Response not found'; end if;

  select * into v_request
  from public.requests
  where id = v_response.request_id
  for update;
  if not found then raise exception 'Request not found'; end if;

  if auth.uid() is null or auth.uid() <> v_request.poster_id then raise exception 'Not authorized'; end if;

  if v_response.status = 'accepted' and v_request.status <> 'open' then
    select c.id into v_connection_id
    from public.connections c
    where c.request_id = v_request.id
      and c.requester_id = v_request.poster_id
      and c.responder_id = v_response.responder_id
      and c.status in ('pending','confirmed','active','completed')
    order by c.created_at desc
    limit 1;
    if found then return v_connection_id; end if;
  end if;

  if v_request.status <> 'open' then raise exception 'Request is no longer open'; end if;
  if v_response.status <> 'pending' then raise exception 'Response is no longer pending'; end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_request.poster_id and ub.blocked_id = v_response.responder_id)
       or (ub.blocker_id = v_response.responder_id and ub.blocked_id = v_request.poster_id)
  ) then
    raise exception 'This connection is unavailable because one participant blocked the other';
  end if;

  insert into public.connections (
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, agreed_terms, payment_method
  ) values (
    v_request.id, v_request.poster_id, v_response.responder_id, true, false,
    'pending', v_request.amount_cents,
    jsonb_build_object('category', v_request.category, 'kind', v_request.kind),
    coalesce(v_request.payment_method, 'none')
  ) returning id into v_connection_id;

  update public.request_responses
  set status = case when id = p_response_id then 'accepted' else 'declined' end
  where request_id = v_request.id and status = 'pending';

  update public.requests
  set status = 'matched', updated_at = now()
  where id = v_request.id;

  return v_connection_id;
end;
$fn$;

create or replace function public.confirm_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_connection public.connections;
begin
  select * into v_connection
  from public.connections
  where id = p_connection_id
  for update;

  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() is null or auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;

  if v_connection.responder_confirmed is true
     and v_connection.status in ('confirmed','active','completed') then
    return;
  end if;

  if v_connection.status <> 'pending' then raise exception 'Connection is not awaiting confirmation'; end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_connection.requester_id and ub.blocked_id = v_connection.responder_id)
       or (ub.blocker_id = v_connection.responder_id and ub.blocked_id = v_connection.requester_id)
  ) then
    raise exception 'This connection is unavailable because one participant blocked the other';
  end if;

  update public.connections
  set responder_confirmed = true,
      status = 'confirmed',
      updated_at = now()
  where id = p_connection_id;
end;
$fn$;
