-- Retire direct browser INSERT after the safe support submission RPC reached production.
-- Browser clients must use submit_support_feedback(...), which validates input and owns moderation fields.

revoke insert on table public.support_feedback from anon, authenticated;
