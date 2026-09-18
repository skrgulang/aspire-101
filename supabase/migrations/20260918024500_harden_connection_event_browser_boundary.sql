-- Limit participant connection-event reads to UI fields and hide internal event_key.

revoke select on table public.connection_events from authenticated;

grant select (
  id,
  connection_id,
  actor_id,
  event_type,
  body,
  metadata,
  created_at
) on table public.connection_events to authenticated;
