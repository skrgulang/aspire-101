-- Retire the legacy browser refund-request surface.
-- Current product refund/dispute UX uses the Resolution Center and server Stripe routes instead.

revoke select on table public.payment_refund_requests from authenticated;
revoke all on function public.request_payment_refund(uuid,text,text) from PUBLIC, anon, authenticated;
grant execute on function public.request_payment_refund(uuid,text,text) to service_role;
