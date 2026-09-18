-- Safety report submission and moderation now use scoped RPCs.
-- Remove the residual direct browser SELECT projection.
revoke select (id, reporter_id, target_user_id, request_id, connection_id, reason, details, status, created_at, reviewed_at)
  on table public.safety_reports from authenticated;
