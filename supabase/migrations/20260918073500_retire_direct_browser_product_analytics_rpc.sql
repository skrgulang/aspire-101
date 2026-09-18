-- Retire the unused direct browser analytics RPC.
-- No application code currently calls this RPC and the analytics table has no events.
-- Keep service-role execution available for future trusted server-side instrumentation.

revoke all on function public.record_product_event(text,text,text,uuid) from PUBLIC, anon, authenticated;
grant execute on function public.record_product_event(text,text,text,uuid) to service_role;
