create or replace function public.confirm_connection_completion(p_connection_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_connection public.connections;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_connection
  from public.connections
  where id = p_connection_id
  for update;

  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;
  if v_connection.status not in ('confirmed','active') then
    raise exception 'Connection is not ready for completion';
  end if;

  -- Mirror Close the Loop eligibility on the server. The client may hide the
  -- completion action, but the RPC must also reject premature direct calls.
  if coalesce(v_connection.coordination_status, '') <> 'in_progress' then
    if v_connection.scheduled_end_at is not null then
      if now() < v_connection.scheduled_end_at then
        raise exception 'Activity is not ready for completion';
      end if;
    elsif v_connection.scheduled_start_at is not null then
      if now() < v_connection.scheduled_start_at then
        raise exception 'Activity is not ready for completion';
      end if;
    else
      raise exception 'Start the activity before confirming completion';
    end if;
  end if;

  insert into public.connection_completion_confirmations(connection_id, user_id)
  values (p_connection_id, auth.uid())
  on conflict (connection_id, user_id) do nothing;

  select count(*)::integer into v_count
  from public.connection_completion_confirmations
  where connection_id = p_connection_id
    and user_id in (v_connection.requester_id, v_connection.responder_id);

  if v_count >= 2 and coalesce(v_connection.payment_method, 'none') <> 'aspire' then
    update public.connections
      set status = 'completed', updated_at = now()
      where id = p_connection_id;
    update public.requests
      set status = 'completed', updated_at = now()
      where id = v_connection.request_id
        and status not in ('completed','cancelled');
  end if;

  return v_count;
end;
$$;

revoke all on function public.confirm_connection_completion(uuid) from public;
grant execute on function public.confirm_connection_completion(uuid) to authenticated;
