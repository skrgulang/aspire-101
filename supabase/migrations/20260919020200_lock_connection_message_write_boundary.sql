-- Browser message sends now go through send_connection_message(uuid,text).
-- Preserve authenticated SELECT for Postgres Realtime while removing direct INSERT columns.
revoke insert (connection_id,sender_id,body) on public.connection_messages from authenticated;
