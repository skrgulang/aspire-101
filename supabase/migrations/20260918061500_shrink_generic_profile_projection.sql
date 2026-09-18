-- Reduce the generic signed-in profile projection to fields still needed by current direct browser reads.
-- Self-only/full-profile details are now served through dedicated RPCs.

revoke select (
  city,
  username,
  username_norm,
  bio,
  campus_last_selected_at,
  created_at,
  updated_at
) on table public.profiles from authenticated;
