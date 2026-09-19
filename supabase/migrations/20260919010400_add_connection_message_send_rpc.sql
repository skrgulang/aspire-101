-- Route browser message writes through a participant-scoped RPC.
-- Existing INSERT triggers continue to enforce account state, content, rate limits, and notifications.

create or replace function public.send_connection_message(p_connection_id uuid, p_body text)
returns table(
  id bigint,
  connection_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_body := btrim(coalesce(p_body,''));
  if v_body = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;
  if not public.can_message_connection(p_connection_id) then
    raise exception 'Not authorized';
  end if;

  return query
  insert into public.connection_messages(connection_id, sender_id, body)
  values (p_connection_id, auth.uid(), v_body)
  returning
    connection_messages.id,
    connection_messages.connection_id,
    connection_messages.sender_id,
    connection_messages.body,
    connection_messages.created_at;
end;
$function$;

revoke execute on function public.send_connection_message(uuid,text) from public, anon;
grant execute on function public.send_connection_message(uuid,text) to authenticated;
