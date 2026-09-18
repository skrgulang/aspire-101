-- The production client now records AI-session outcomes through a narrow RPC.
-- Remove direct browser access to the full AI-session table and its column updates.

revoke all on table public.aspire_ai_sessions from anon, authenticated;
revoke update (outcome, created_request_id) on table public.aspire_ai_sessions from authenticated;

revoke all on function public.mark_my_aspire_ai_session_outcome(uuid,text) from public, anon;
grant execute on function public.mark_my_aspire_ai_session_outcome(uuid,text) to authenticated, service_role;
