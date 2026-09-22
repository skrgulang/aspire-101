-- Mirror external Stripe disputes/Radar warnings into Aspire's human review queue.
-- System-originated cases have no user reporter.

alter table public.market_disputes
  alter column opened_by drop not null;

alter table public.market_disputes
  add column if not exists source text not null default 'user',
  add column if not exists stripe_case_id text,
  add column if not exists stripe_status text,
  add column if not exists stripe_outcome text,
  add column if not exists stripe_status_updated_at timestamptz;

alter table public.market_disputes
  drop constraint if exists market_disputes_source_check;
alter table public.market_disputes
  add constraint market_disputes_source_check
  check (source in ('user','stripe_dispute','stripe_radar'));

create unique index if not exists market_disputes_stripe_case_id_uidx
  on public.market_disputes(stripe_case_id)
  where stripe_case_id is not null;
