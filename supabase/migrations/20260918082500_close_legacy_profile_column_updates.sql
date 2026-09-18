-- All current browser profile writes now use narrow self-only RPCs.
-- Remove the remaining legacy column-level UPDATE grants so users cannot bypass
-- validation by calling PostgREST directly.

revoke update (
  avatar_url,
  bio,
  campus_last_selected_at,
  city,
  current_campus_id,
  display_name,
  full_name,
  image_url,
  name,
  username
) on public.profiles from authenticated;
