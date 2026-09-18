-- Retire the unused browser analytics RPC.
-- Current product code does not call record_product_event(...); keeping anonymous
-- SECURITY DEFINER execution only exposes a database-write spam surface.

revoke all on function public.record_product_event(text,text,text,uuid) from PUBLIC, anon, authenticated;
grant execute on function public.record_product_event(text,text,text,uuid) to service_role;
