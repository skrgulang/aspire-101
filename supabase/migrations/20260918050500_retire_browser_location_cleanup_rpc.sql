-- Expired live locations are cleaned by the trusted reminder cron.
-- Browser clients already cannot read expired rows because RLS filters expires_at > now().
-- Retire authenticated execution of the global cleanup helper.

revoke all on function public.cleanup_expired_connection_locations() from PUBLIC, anon, authenticated;
grant execute on function public.cleanup_expired_connection_locations() to service_role;
