-- Keep marketplace delivery coordination rows behind the existing RPC/server workflows.
-- Current client code does not read these tables directly.

revoke select on table public.market_delivery_links from authenticated;
revoke select on table public.market_seller_delivery_quotes from authenticated;
revoke select on table public.aspirer_delivery_offers from authenticated;
