-- These functions are internal application surfaces. Explicit role revokes are
-- required because older project defaults may have granted EXECUTE directly to
-- anon/authenticated in addition to the implicit PUBLIC grant.

revoke all on function public.get_my_profile_banner() from public, anon;
grant execute on function public.get_my_profile_banner() to authenticated, service_role;

revoke all on function public.notify_market_order_status_change() from public, anon, authenticated;
grant execute on function public.notify_market_order_status_change() to service_role;
