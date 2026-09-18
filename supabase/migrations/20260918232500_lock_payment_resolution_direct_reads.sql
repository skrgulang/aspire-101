-- Browser payment and resolution reads now use participant-scoped RPCs.
-- Remove the residual authenticated column-level SELECT grants while preserving service-role access.

revoke select (
  id,connection_id,request_id,payer_id,payee_id,currency,
  gross_amount_cents,platform_fee_cents,provider_amount_cents,status,
  paid_at,released_at,refunded_at,disputed_at,created_at,updated_at,
  base_amount_cents,requester_fee_cents,provider_fee_cents,tip_amount_cents,
  tip_fee_cents,customer_total_cents,provider_net_cents,fee_policy_version
) on table public.connection_payments from authenticated;

revoke select (
  id,connection_id,request_id,opened_by,against_user_id,reason,
  requested_resolution,details,status,payment_status_snapshot,
  payment_total_cents_snapshot,currency_snapshot,scheduled_start_snapshot,
  meeting_label_snapshot,coordination_status_snapshot,resolution_note,
  refund_cents,provider_release_cents,reviewed_at,created_at,updated_at
) on table public.connection_resolution_cases from authenticated;
