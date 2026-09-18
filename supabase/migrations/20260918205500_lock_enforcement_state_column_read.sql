-- Current browser code reads enforcement state only through scoped RPCs.
-- Remove the leftover column-level direct SELECT grant.
revoke select (user_id, state, reason, expires_at)
  on table public.user_enforcement_states from authenticated;
