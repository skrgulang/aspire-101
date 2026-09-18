-- Keep raw marketplace event payloads on trusted server paths.
-- Participant UIs use sanitized order/dispute RPCs and do not query this audit table.

revoke all on table public.market_order_events from anon;
revoke select on table public.market_order_events from authenticated;
