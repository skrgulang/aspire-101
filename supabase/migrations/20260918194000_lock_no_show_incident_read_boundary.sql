-- The moderator console now reads no-show incidents through an MFA-aware RPC.
-- Retire generic authenticated table SELECT so staff history is not exposed as a browser table surface.

revoke select on table public.connection_no_show_incidents from authenticated;
