-- Request responses are read through owner-scoped / self-scoped RPCs.
-- Keep service-role/database-owner access intact while removing the generic browser SELECT surface.
revoke select on table public.request_responses from authenticated;
