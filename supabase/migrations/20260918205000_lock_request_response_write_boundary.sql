-- Browser response creation and state changes now flow through validated RPCs.
-- Remove the leftover column-level direct mutation grants.
revoke insert (request_id, responder_id, message)
  on table public.request_responses from authenticated;

revoke update (message, status)
  on table public.request_responses from authenticated;
