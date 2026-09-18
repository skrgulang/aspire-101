-- Exact/private location tables are no longer part of the browser API.
-- Current app code does not read or write these tables directly; account export/deletion uses service-role access.

revoke all on table public.request_private_locations from anon, authenticated;
revoke all on table public.user_locations from anon, authenticated;
