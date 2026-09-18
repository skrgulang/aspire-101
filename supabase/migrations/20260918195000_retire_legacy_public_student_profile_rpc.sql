-- Retire the older student-profile RPC from browser roles.
-- The current app uses get_public_profile(...), which applies the active visibility model.

revoke all on function public.get_public_student_profile(uuid) from PUBLIC, anon, authenticated;
grant execute on function public.get_public_student_profile(uuid) to service_role;
