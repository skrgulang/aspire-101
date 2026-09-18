-- Retire authenticated table reads that are no longer used by the current browser client.
-- Trusted RPC/service-role flows continue to access these tables internally.

revoke select on table public.connection_cancellations from authenticated;
revoke select on table public.connection_message_reads from authenticated;
revoke select on table public.connection_payment_agreements from authenticated;
revoke select on table public.safety_acknowledgements from authenticated;

drop policy if exists "participants can read connection cancellations" on public.connection_cancellations;
drop policy if exists "users read own message cursor" on public.connection_message_reads;
drop policy if exists "connection_payment_agreements_participants" on public.connection_payment_agreements;
drop policy if exists "users read acknowledgements" on public.safety_acknowledgements;
