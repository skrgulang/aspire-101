-- Anonymous visitors do not need any DML privileges on private Trust, payment, verification, or transaction tables.
revoke all privileges on table public.identity_verifications from anon;
revoke all privileges on table public.market_orders from anon;
revoke all privileges on table public.market_disputes from anon;
revoke all privileges on table public.market_order_events from anon;
revoke all privileges on table public.connection_payments from anon;
revoke all privileges on table public.payment_accounts from anon;
revoke all privileges on table public.request_media from anon;
revoke all privileges on table public.request_private_locations from anon;
revoke all privileges on table public.request_ai_assessments from anon;
revoke all privileges on table public.user_trust_profiles from anon;
revoke all privileges on table public.moderation_actions from anon;
revoke all privileges on table public.stripe_webhook_events from anon;
