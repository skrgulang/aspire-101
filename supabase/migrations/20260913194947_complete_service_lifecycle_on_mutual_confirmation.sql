-- Service completion is independent from payout success. Once both participants
-- confirm a service activity complete, move it to History even if Pay with Aspire
-- was selected but checkout never secured or payout setup is incomplete.
-- Marketplace orders keep their separate handoff / receipt / release lifecycle.

create or replace function public.confirm_connection_completion(p_connection_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_connection public.connections;
  v_count integer;
  v_is_marketplace boolean;
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

  -- Mirror the Close the Loop eligibility rules on the server so clients cannot
  -- confirm completion before the activity is actually eligible to close.
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

  select exists(
    select 1 from public.market_orders mo where mo.connection_id = p_connection_id
  ) into v_is_marketplace;

  if v_count >= 2 and not v_is_marketplace then
    update public.connections
      set status = 'completed', updated_at = now()
      where id = p_connection_id
        and status <> 'cancelled';
    update public.requests
      set status = 'completed', updated_at = now()
      where id = v_connection.request_id
        and status not in ('completed','cancelled');
  end if;

  return v_count;
end;
$function$;
