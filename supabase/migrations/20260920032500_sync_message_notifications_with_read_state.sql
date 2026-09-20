-- Keep the global Inbox notification badge consistent with per-chat read state.
-- Reading a connection through the chat UI also marks its corresponding message
-- notifications as read.
create or replace function public.mark_connection_read(
  p_connection_id uuid,
  p_last_message_id bigint default null::bigint
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_last bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.connections c
    where c.id = p_connection_id
      and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
  ) then
    raise exception 'Not authorized';
  end if;

  if p_last_message_id is null then
    select max(id) into v_last
    from public.connection_messages
    where connection_id = p_connection_id;
  else
    select max(id) into v_last
    from public.connection_messages
    where connection_id = p_connection_id
      and id <= p_last_message_id;
  end if;

  insert into public.connection_message_reads(connection_id, user_id, last_read_message_id, last_read_at)
  values (p_connection_id, auth.uid(), v_last, now())
  on conflict (connection_id, user_id) do update
    set last_read_message_id = case
          when public.connection_message_reads.last_read_message_id is null then excluded.last_read_message_id
          when excluded.last_read_message_id is null then public.connection_message_reads.last_read_message_id
          else greatest(public.connection_message_reads.last_read_message_id, excluded.last_read_message_id)
        end,
        last_read_at = now();

  if v_last is not null then
    update public.notifications
    set read_at = coalesce(read_at, now())
    where user_id = auth.uid()
      and connection_id = p_connection_id
      and kind = 'message'
      and read_at is null
      and (message_id is null or message_id <= v_last);
  end if;

  return coalesce(v_last, 0);
end;
$function$;

revoke all on function public.mark_connection_read(uuid,bigint) from public, anon;
grant execute on function public.mark_connection_read(uuid,bigint) to authenticated, service_role;

-- Reconcile old notification rows that are already covered by a chat read cursor.
update public.notifications n
set read_at = coalesce(n.read_at, r.last_read_at, now())
from public.connection_message_reads r
where n.kind = 'message'
  and n.read_at is null
  and n.user_id = r.user_id
  and n.connection_id = r.connection_id
  and r.last_read_message_id is not null
  and (n.message_id is null or n.message_id <= r.last_read_message_id);
