-- Payment privilege hardening for Aspire protected payments.
-- Keep payment state mutations behind authenticated RPCs / server routes.

revoke all on table public.connection_payment_agreements from anon, authenticated;
grant select on table public.connection_payment_agreements to authenticated;
grant all on table public.connection_payment_agreements to service_role;

revoke all on table public.connection_payments from anon, authenticated;
grant select on table public.connection_payments to authenticated;
grant all on table public.connection_payments to service_role;

revoke all on table public.payment_accounts from anon, authenticated;
grant select on table public.payment_accounts to authenticated;
grant all on table public.payment_accounts to service_role;

revoke all on table public.payment_ledger_events from anon, authenticated;
grant select on table public.payment_ledger_events to authenticated;
grant all on table public.payment_ledger_events to service_role;

revoke all on table public.payment_refund_requests from anon, authenticated;
grant select on table public.payment_refund_requests to authenticated;
grant all on table public.payment_refund_requests to service_role;

revoke all on table public.stripe_webhook_events from anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

revoke all on function public.propose_connection_payment_terms(uuid, integer, text) from public, anon;
grant execute on function public.propose_connection_payment_terms(uuid, integer, text) to authenticated, service_role;

revoke all on function public.accept_connection_payment_terms(uuid) from public, anon;
grant execute on function public.accept_connection_payment_terms(uuid) to authenticated, service_role;

revoke all on function public.request_payment_refund(uuid, text, text) from public, anon;
grant execute on function public.request_payment_refund(uuid, text, text) to authenticated, service_role;
