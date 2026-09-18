-- Keep raw connection agreed_terms server-side while preserving participant-facing connection fields.

revoke select on table public.connections from authenticated;

grant select (
  id,
  request_id,
  requester_id,
  responder_id,
  requester_confirmed,
  responder_confirmed,
  status,
  agreed_amount_cents,
  payment_method,
  created_at,
  updated_at,
  scheduled_start_at,
  scheduled_end_at,
  timezone,
  meeting_label,
  coordination_status,
  last_coordination_actor_id,
  last_coordination_at
) on table public.connections to authenticated;
