-- Close legacy marketplace-order browser paths now that the safe RPC client is deployed.

revoke select on table public.market_orders from authenticated;

revoke execute on function public.market_mark_handoff(uuid) from public, anon, authenticated;
revoke execute on function public.market_confirm_receipt(uuid) from public, anon, authenticated;
revoke execute on function public.market_open_dispute(uuid,text,text) from public, anon, authenticated;

grant execute on function public.market_mark_handoff(uuid) to service_role;
grant execute on function public.market_confirm_receipt(uuid) to service_role;
grant execute on function public.market_open_dispute(uuid,text,text) to service_role;

revoke all on function public.get_my_market_orders(uuid[]) from public, anon;
grant execute on function public.get_my_market_orders(uuid[]) to authenticated, service_role;

revoke all on function public.market_mark_handoff_safe(uuid) from public, anon;
revoke all on function public.market_confirm_receipt_safe(uuid) from public, anon;
revoke all on function public.market_open_dispute_safe(uuid,text,text) from public, anon;
grant execute on function public.market_mark_handoff_safe(uuid) to authenticated, service_role;
grant execute on function public.market_confirm_receipt_safe(uuid) to authenticated, service_role;
grant execute on function public.market_open_dispute_safe(uuid,text,text) to authenticated, service_role;
