-- Browser completion-state reads now use get_completion_confirmations_for_my_connections(uuid[]).
-- Keep service-role/internal access while removing the generic authenticated table SELECT path.
revoke select on table public.connection_completion_confirmations from authenticated;
