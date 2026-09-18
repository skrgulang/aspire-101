-- Close direct marketplace dispute browser reads after the safe RPC client reached production.

revoke select on table public.market_disputes from authenticated;

revoke all on function public.get_my_market_disputes(uuid[]) from public, anon;
grant execute on function public.get_my_market_disputes(uuid[]) to authenticated, service_role;
