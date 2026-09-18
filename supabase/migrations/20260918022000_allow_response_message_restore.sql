-- Allow responders to update their message when restoring a withdrawn response.
-- RLS still restricts UPDATE to the responder's own pending/withdrawn row.

grant update (message) on table public.request_responses to authenticated;
