-- Auth-required marketplace mutation RPCs should not be callable by anonymous sessions.
-- Each function already rejects auth.uid() = null; this makes the database privilege boundary match that contract.

revoke all on function public.accept_market_seller_delivery_quote(uuid,jsonb,text) from PUBLIC, anon;
revoke all on function public.cancel_market_seller_delivery_request(uuid) from PUBLIC, anon;
revoke all on function public.cancel_unpaid_marketplace_reservation(uuid) from PUBLIC, anon;
revoke all on function public.create_market_delivery_request_for_order(uuid,text,text,integer,text,text) from PUBLIC, anon;
revoke all on function public.decline_market_seller_delivery(uuid,text) from PUBLIC, anon;
revoke all on function public.purchase_marketplace_listing(uuid,text,text,text) from PUBLIC, anon;
revoke all on function public.quote_market_seller_delivery(uuid,integer,text) from PUBLIC, anon;
revoke all on function public.request_market_seller_delivery(uuid,text,text) from PUBLIC, anon;
revoke all on function public.set_market_order_delivery_address(uuid,jsonb,text) from PUBLIC, anon;
revoke all on function public.update_market_seller_delivery_status(uuid,text) from PUBLIC, anon;

grant execute on function public.accept_market_seller_delivery_quote(uuid,jsonb,text) to authenticated, service_role;
grant execute on function public.cancel_market_seller_delivery_request(uuid) to authenticated, service_role;
grant execute on function public.cancel_unpaid_marketplace_reservation(uuid) to authenticated, service_role;
grant execute on function public.create_market_delivery_request_for_order(uuid,text,text,integer,text,text) to authenticated, service_role;
grant execute on function public.decline_market_seller_delivery(uuid,text) to authenticated, service_role;
grant execute on function public.purchase_marketplace_listing(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.quote_market_seller_delivery(uuid,integer,text) to authenticated, service_role;
grant execute on function public.request_market_seller_delivery(uuid,text,text) to authenticated, service_role;
grant execute on function public.set_market_order_delivery_address(uuid,jsonb,text) to authenticated, service_role;
grant execute on function public.update_market_seller_delivery_status(uuid,text) to authenticated, service_role;
