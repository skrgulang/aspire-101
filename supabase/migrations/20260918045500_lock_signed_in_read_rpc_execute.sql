-- These SECURITY DEFINER read RPCs are signed-in-only by function contract.
-- Remove PUBLIC/anonymous EXECUTE so the privilege boundary matches the function checks.

revoke all on function public.discover_requests(uuid,text,text,integer,text) from PUBLIC, anon;
revoke all on function public.get_public_student_profile(uuid) from PUBLIC, anon;

grant execute on function public.discover_requests(uuid,text,text,integer,text) to authenticated, service_role;
grant execute on function public.get_public_student_profile(uuid) to authenticated, service_role;
