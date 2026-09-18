-- Connections Hub now reads the signed-in user's own reviews through get_my_connection_reviews(uuid[]).
-- Keep service-role/internal access while removing the generic authenticated table SELECT path.
revoke select on table public.connection_reviews from authenticated;
