-- Exact Seller Delivery addresses are exposed only through the gated SECURITY DEFINER RPC.
-- Buyers and sellers should not read the private address table directly.

revoke all on table public.market_seller_delivery_private_addresses from anon, authenticated;

revoke all on function public.get_market_seller_delivery_address(uuid) from public, anon;
grant execute on function public.get_market_seller_delivery_address(uuid) to authenticated, service_role;
