-- Browser identity status now reads through get_my_identity_verification().
-- Keep service-role/internal access while removing the authenticated table/column SELECT path.
revoke select on table public.identity_verifications from authenticated;
revoke select (user_id,status,last_error,verified_at) on table public.identity_verifications from authenticated;
