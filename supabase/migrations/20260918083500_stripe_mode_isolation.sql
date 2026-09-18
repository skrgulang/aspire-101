-- Keep Stripe test/live state isolated in durable Aspire records.
-- Existing production payment/identity records are sandbox-backed, so the safe backfill is false.

alter table public.connection_payments
  add column if not exists stripe_livemode boolean not null default false;

alter table public.identity_verifications
  add column if not exists stripe_livemode boolean not null default false;

comment on column public.connection_payments.stripe_livemode is
  'Stripe mode for the provider objects attached to this payment. Prevents test/live webhook cross-contamination.';

comment on column public.identity_verifications.stripe_livemode is
  'Stripe mode for the active Identity verification session.';
