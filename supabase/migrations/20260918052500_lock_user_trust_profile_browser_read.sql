-- Trust/scam scoring is internal safety intelligence.
-- Current browser UI does not read this table directly; trusted server moderation workflows do.

revoke select on table public.user_trust_profiles from authenticated;
