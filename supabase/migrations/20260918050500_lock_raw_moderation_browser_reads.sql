-- Keep raw moderation intelligence and moderator audit trails off direct browser table reads.
-- Current client code uses the request moderation API / safe moderator RPCs, not these raw tables.

revoke select on table public.request_ai_assessments from authenticated;
revoke select on table public.request_layered_moderation_audit from authenticated;
revoke select on table public.moderation_actions from authenticated;
