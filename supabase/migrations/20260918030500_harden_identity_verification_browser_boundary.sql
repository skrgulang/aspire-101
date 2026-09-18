-- Keep Stripe Identity provider/session details and all writes server-side.

revoke all on table public.identity_verifications from anon, authenticated;

grant select (
  user_id,
  status,
  verified_at,
  last_error
) on table public.identity_verifications to authenticated;
