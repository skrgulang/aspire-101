-- The browser now reads only its effective role through get_my_role().
-- Retire direct authenticated SELECT on authorization metadata.

revoke select on table public.user_roles from authenticated;

drop policy if exists "role owner or admin read" on public.user_roles;
