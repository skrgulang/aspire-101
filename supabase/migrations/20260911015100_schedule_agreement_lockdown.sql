-- Once mutual schedule proposals are enabled, authenticated participants must not be able
-- to bypass acceptance by calling the legacy direct schedule RPC themselves.
revoke execute on function public.set_connection_schedule(uuid,timestamptz,text,text,timestamptz) from authenticated;
