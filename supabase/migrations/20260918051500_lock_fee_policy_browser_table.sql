-- Fee policy is server-managed configuration.
-- Browser clients quote fees through quote_aspire_fees(...), not direct table access.

revoke all privileges on table public.fee_policies from authenticated;
