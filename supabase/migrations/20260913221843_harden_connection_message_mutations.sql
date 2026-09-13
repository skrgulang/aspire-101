revoke all on table public.connection_messages from authenticated;
grant select on table public.connection_messages to authenticated;
grant insert (connection_id, sender_id, body) on table public.connection_messages to authenticated;
