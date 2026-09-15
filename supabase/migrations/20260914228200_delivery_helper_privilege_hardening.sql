-- Keep helper-verification internals off the direct authenticated RPC surface.
-- delivery_make_offer() calls this function inside a guarded SECURITY DEFINER path,
-- so browser clients do not need to probe arbitrary users' email/phone verification state.

revoke all on function public.delivery_helper_is_verified(uuid) from public, anon, authenticated;
grant execute on function public.delivery_helper_is_verified(uuid) to service_role;
