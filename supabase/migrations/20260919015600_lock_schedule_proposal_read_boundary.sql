-- Aspire Live now reads pending schedule proposals through a participant-scoped RPC.
-- Keep service-role/internal access while removing authenticated direct SELECT paths.
revoke select on public.connection_schedule_proposals from authenticated;
revoke select (id,connection_id,proposed_by,start_at,end_at,timezone,meeting_label,status,responded_by,responded_at,created_at,updated_at) on public.connection_schedule_proposals from authenticated;
