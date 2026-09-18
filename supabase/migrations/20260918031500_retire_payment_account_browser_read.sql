-- Payment account provider identifiers and payout state are served only through authenticated server routes.
-- No current browser code reads public.payment_accounts directly.

revoke all on table public.payment_accounts from anon, authenticated;
