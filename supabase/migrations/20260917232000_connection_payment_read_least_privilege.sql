-- Participants should see payment state and amounts, not provider object IDs,
-- internal retry/claim markers, or fee-policy snapshots.

revoke select on table public.connection_payments from authenticated;

grant select (
  id,
  connection_id,
  request_id,
  payer_id,
  payee_id,
  currency,
  gross_amount_cents,
  platform_fee_cents,
  provider_amount_cents,
  status,
  paid_at,
  released_at,
  refunded_at,
  disputed_at,
  created_at,
  updated_at,
  base_amount_cents,
  requester_fee_cents,
  provider_fee_cents,
  tip_amount_cents,
  tip_fee_cents,
  customer_total_cents,
  provider_net_cents,
  fee_policy_version
) on table public.connection_payments to authenticated;
