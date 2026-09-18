-- Aspire Live now reads exact coordinates through a participant-scoped RPC.
-- Retire generic authenticated SELECT on the exact-location table.

revoke select on table public.connection_live_locations from authenticated;
