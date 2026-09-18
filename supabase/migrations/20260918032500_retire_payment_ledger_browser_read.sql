-- Keep Stripe/provider ledger details server-side.
-- Browser payment UIs use connection payment projections and authenticated API routes instead.

revoke all on table public.payment_ledger_events from anon;
revoke select on table public.payment_ledger_events from authenticated;
