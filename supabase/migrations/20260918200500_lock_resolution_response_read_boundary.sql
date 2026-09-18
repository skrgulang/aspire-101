-- Resolution responses now read through get_my_resolution_responses(...).
-- Retire generic authenticated table SELECT so private dispute details stay behind the participant/moderator RPC.

revoke select on table public.connection_resolution_responses from authenticated;
