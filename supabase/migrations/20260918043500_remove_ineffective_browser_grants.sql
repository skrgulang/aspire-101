-- Remove browser privileges that have no matching RLS policy and therefore serve no valid client flow.
-- This reduces the blast radius of future policy mistakes without changing any currently permitted browser behavior.

revoke insert, update, delete on table public.connection_completion_confirmations from anon;
revoke insert, update, delete on table public.fee_policies from anon;
revoke insert, update, delete on table public.market_delivery_links from anon;
revoke select on table public.market_seller_delivery_quotes from anon;

revoke update, delete on table public.safety_acknowledgements from authenticated;
revoke update on table public.user_blocks from authenticated;
revoke delete on table public.user_preferences from authenticated;
