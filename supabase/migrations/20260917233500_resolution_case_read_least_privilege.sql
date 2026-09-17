-- Participants need case state and outcomes, not captured internal evidence
-- or the UUID of the staff reviewer. Staff fetch full cases through the
-- moderator-only SECURITY DEFINER RPC.

revoke select on table public.connection_resolution_cases from authenticated;

grant select (
  id,
  connection_id,
  request_id,
  opened_by,
  against_user_id,
  reason,
  requested_resolution,
  details,
  status,
  payment_status_snapshot,
  payment_total_cents_snapshot,
  currency_snapshot,
  scheduled_start_snapshot,
  meeting_label_snapshot,
  coordination_status_snapshot,
  resolution_note,
  refund_cents,
  provider_release_cents,
  reviewed_at,
  created_at,
  updated_at
) on table public.connection_resolution_cases to authenticated;
