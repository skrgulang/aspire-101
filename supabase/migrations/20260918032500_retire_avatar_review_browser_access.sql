-- Avatar moderation review internals are server-side only.
-- Current application code does not read or mutate this table directly from the browser.

revoke all on table public.avatar_moderation_reviews from anon, authenticated;
