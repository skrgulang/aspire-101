-- Allow either participant to safely reopen a request while the chosen responder
-- has not yet confirmed. This preserves the mutual-choice model instead of
-- cancelling the original post when a pending selection falls through.

create or replace function public.reset_pending_connection(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_connection public.connections;
  v_request public.requests;
  v_actor uuid := auth.uid();
  v_other uuid;
  v_result text;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select * into v_connection
  from public.connections
  where id = p_connection_id
  for update;

  if not found then
    raise exception 'Connection not found';
  end if;

  if v_actor <> v_connection.requester_id and v_actor <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;

  if v_connection.status <> 'pending'
     or v_connection.requester_confirmed is not true
     or v_connection.responder_confirmed is true then
    raise exception 'Only an unconfirmed connection choice can be reopened';
  end if;

  select * into v_request
  from public.requests
  where id = v_connection.request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.status <> 'matched' then
    raise exception 'Request is not awaiting responder confirmation';
  end if;

  -- Never erase a selection after payment activity has started. Pending marketplace
  -- orders with no payment are safe to remove through the connection cascade.
  if exists (
    select 1 from public.connection_payments cp
    where cp.connection_id = p_connection_id
  ) then
    raise exception 'PAYMENT_ACTIVITY_EXISTS';
  end if;

  if exists (
    select 1 from public.market_orders mo
    where mo.connection_id = p_connection_id
      and (mo.payment_id is not null or mo.status not in ('awaiting_payment','off_platform'))
  ) then
    raise exception 'PAYMENT_ACTIVITY_EXISTS';
  end if;

  if v_actor = v_connection.requester_id then
    -- The requester changed their choice. Restore the accepted response and every
    -- response auto-declined by accept_request_response so another choice can be made.
    update public.request_responses
    set status = 'pending'
    where request_id = v_connection.request_id
      and status in ('accepted','declined');

    v_other := v_connection.responder_id;
    v_result := 'requester_reopened';

    perform public.push_notification(
      v_other,
      'connection_cancelled',
      'connection-reopened:' || p_connection_id::text || ':' || v_other::text,
      'The requester reopened their post',
      'This connection was not confirmed. The request is open again and they can choose a responder.',
      v_actor,
      v_connection.request_id,
      null,
      p_connection_id,
      null
    );
  else
    -- The chosen responder declined. Their response becomes withdrawn while the
    -- other responses that were auto-declined become available to the requester again.
    update public.request_responses
    set status = case
      when responder_id = v_connection.responder_id and status = 'accepted' then 'withdrawn'
      when responder_id <> v_connection.responder_id and status = 'declined' then 'pending'
      else status
    end
    where request_id = v_connection.request_id;

    v_other := v_connection.requester_id;
    v_result := 'responder_declined';

    perform public.push_notification(
      v_other,
      'connection_cancelled',
      'connection-declined:' || p_connection_id::text || ':' || v_other::text,
      'A responder declined the connection',
      'Your request is open again so you can choose another responder.',
      v_actor,
      v_connection.request_id,
      null,
      p_connection_id,
      null
    );
  end if;

  update public.requests
  set status = 'open', updated_at = now()
  where id = v_connection.request_id;

  -- A pending connection cannot have chat activity. Removing it avoids creating a
  -- misleading cancelled-history entry; related unpaid marketplace scaffolding cascades.
  delete from public.connections
  where id = p_connection_id;

  return v_result;
end;
$$;

revoke all on function public.reset_pending_connection(uuid) from public, anon;
grant execute on function public.reset_pending_connection(uuid) to authenticated;
